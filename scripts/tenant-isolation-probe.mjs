/**
 * Tenant-isolation probe (Phase 12, spec §3.5) — proves RLS + the membership
 * guard prevent any cross-org data leak or write. Run on demand:
 *
 *   node --env-file=.env.local scripts/tenant-isolation-probe.mjs
 *
 * Everything runs inside a transaction that is ROLLED BACK — no data persists.
 * Requires SUPABASE_DB_PASSWORD + NEXT_PUBLIC_SUPABASE_URL in .env.local and at
 * least one auth.users row. Exit code 0 = isolation holds; non-zero = leak.
 */
import pg from "pg";

const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const c = new pg.Client({
  host: `db.${ref}.supabase.co`, port: 5432, user: "postgres", database: "postgres",
  password: process.env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false },
});

const asUser = (uid) =>
  c.query("select set_config('request.jwt.claims', json_build_object('sub',$1::text,'role','authenticated')::text, true)", [uid]);
const line = (d, cr, amt) => JSON.stringify([{ account_code: d, debit: amt }, { account_code: cr, credit: amt }]);

const fail = (msg) => { console.error("LEAK:", msg); process.exitCode = 1; };

await c.connect();
const users = (await c.query("select id from auth.users limit 2")).rows;
if (!users.length) { console.error("need at least one auth user"); process.exit(2); }
const alice = users[0].id;
const bob = users[1]?.id ?? users[0].id;

await c.query("BEGIN");
await c.query("set local role authenticated");

await asUser(alice);
const orgA = (await c.query("select public.ensure_org('Iso A') id")).rows[0].id;
await c.query("select public.post_journal_entry($1,current_date,'manual',$2::jsonb,'A')", [orgA, line("1000", "4000", 111)]);

await asUser(bob);
const orgB = (await c.query("select public.ensure_org('Iso B') id")).rows[0].id;
await c.query("select public.post_journal_entry($1,current_date,'manual',$2::jsonb,'B')", [orgB, line("1000", "4000", 222)]);

// Alice must see her org and NOTHING of org B.
await asUser(alice);
const own = (await c.query("select count(*)::int n from journal_entries where org_id=$1", [orgA])).rows[0].n;
const other = (await c.query("select count(*)::int n from journal_entries where org_id=$1", [orgB])).rows[0].n;
const otherAcct = (await c.query("select count(*)::int n from accounts where org_id=$1", [orgB])).rows[0].n;
const visibleOrgs = (await c.query("select count(distinct org_id)::int n from journal_entries")).rows[0].n;
if (own < 1) fail("Alice cannot see her own entries");
if (other !== 0) fail(`Alice can see ${other} of org B's entries`);
if (otherAcct !== 0) fail(`Alice can see ${otherAcct} of org B's accounts`);
if (visibleOrgs !== 1) fail(`Unfiltered scan exposes ${visibleOrgs} orgs to Alice`);

// Alice must not be able to WRITE into org B.
await c.query("SAVEPOINT sp");
let wrote = false;
try { await c.query("select public.post_journal_entry($1,current_date,'manual',$2::jsonb,'evil')", [orgB, line("1000", "4000", 1)]); wrote = true; }
catch { /* expected */ }
await c.query("ROLLBACK TO SAVEPOINT sp");
if (wrote) fail("Alice was able to post into org B");

await c.query("ROLLBACK");
await c.end();

if (process.exitCode) console.error("TENANT ISOLATION: FAILED");
else console.log("TENANT ISOLATION: OK — no cross-org reads or writes.");
