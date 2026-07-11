"use client";
/**
 * Join a workspace (staff login flow):
 *   1. the owner shares an invite code (from Settings → Staff access),
 *   2. the staff member signs in with their OWN Tulmin account,
 *   3. they redeem the code here → the shared workspace loads with their role.
 */
import { useEffect, useState } from "react";
import { KeyRound, CheckCircle2 } from "lucide-react";
import { Guard, PageHeader } from "@/book/components/v2/common";
import { Button, Card } from "@/book/components/ui";
import { isBookAuthed, joinWithInviteCode } from "@/book/lib/bookStateRemote";

export default function JoinWorkspacePage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void isBookAuthed().then(setAuthed);
    const pre = new URLSearchParams(window.location.search).get("code");
    if (pre) setCode(pre);
  }, []);

  async function join() {
    setBusy(true); setErr(null);
    const res = await joinWithInviteCode(code);
    setBusy(false);
    if (!res.ok) { setErr(res.message ?? "Could not join."); return; }
    setDone(true);
    // reload so the store hydrates the shared workspace with the staff role
    window.setTimeout(() => window.location.assign("/book/dashboard"), 1200);
  }

  return (
    <Guard section="join">
      <PageHeader title="Join a workspace" sub="Redeem an invite code from your business owner" />
      <Card className="mx-auto max-w-md p-6">
        {done ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <CheckCircle2 className="h-8 w-8 text-success" />
            <p className="font-medium">You&apos;re in! Loading the shared workspace…</p>
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
              <KeyRound className="h-4 w-4" />
              {authed === false
                ? "First sign in with YOUR account (top of the sidebar), then redeem the code."
                : "Paste the invite code your business owner shared with you."}
            </div>
            <div className="flex gap-2">
              <input
                className="h-11 flex-1 rounded-lg border border-border bg-background px-3.5 font-mono text-sm outline-none focus:border-primary"
                placeholder="join-xxxxxxxxxxxx"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && code.trim() && authed) join(); }}
              />
              <Button onClick={join} disabled={!code.trim() || busy || !authed}>Join</Button>
            </div>
            {err && <p className="mt-2 text-xs text-danger">{err}</p>}
            {authed === false && <p className="mt-3 text-xs text-warning">You&apos;re not signed in — the Join button unlocks after sign-in.</p>}
          </>
        )}
      </Card>
    </Guard>
  );
}
