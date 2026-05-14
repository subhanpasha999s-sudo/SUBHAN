import { promises as fs } from "node:fs";
import path from "node:path";

import type { AdminPrincipal } from "@/lib/admin/blog-admin-auth";

const auditPath = path.join(process.cwd(), "src/content/blog-audit-log.json");

export type BlogAuditEntry = {
  id: string;
  at: string;
  actorEmail: string;
  actorRole: AdminPrincipal["role"];
  action: string;
  slug?: string;
};

async function readAuditLog() {
  try {
    return JSON.parse(await fs.readFile(auditPath, "utf8")) as BlogAuditEntry[];
  } catch {
    return [];
  }
}

export async function appendBlogAuditLog(
  actor: AdminPrincipal,
  action: string,
  slug?: string,
) {
  const log = await readAuditLog();
  log.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    actorEmail: actor.email,
    actorRole: actor.role,
    action,
    slug,
  });
  await fs.writeFile(auditPath, `${JSON.stringify(log.slice(0, 300), null, 2)}\n`);
}
