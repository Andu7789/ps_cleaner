"use client";

import { useState, useTransition } from "react";
import { inviteAdminAction, removeAdminAction, updateAdminRoleAction } from "@/lib/actions/admin";
import { formatDate } from "@/lib/format";
import type { AdminRole, AdminUser } from "@/lib/types";

export function AdminTeamManager({ admins, currentUserId }: { admins: AdminUser[]; currentUserId: string }) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<AdminRole>("admin");
  const [pending, startTransition] = useTransition();
  const [rowError, setRowError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleInvite() {
    if (!email.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        await inviteAdminAction({ email: email.trim(), displayName: displayName.trim() || undefined, role });
        setEmail("");
        setDisplayName("");
        setRole("admin");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't invite that admin");
      }
    });
  }

  function handleRemove(id: string) {
    setRowError(null);
    startTransition(async () => {
      try {
        await removeAdminAction(id);
      } catch (err) {
        setRowError(err instanceof Error ? err.message : "Couldn't remove this admin");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold text-foreground">Admins &amp; owners</h2>
        <div className="mt-3 space-y-2">
          {admins.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{a.display_name || a.email}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {a.email}
                  {!a.user_id && " · Invited, not yet signed in"}
                  {" · Added "}
                  {formatDate(a.created_at)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <select
                  value={a.role}
                  disabled={pending || a.user_id === currentUserId}
                  onChange={(e) => startTransition(() => updateAdminRoleAction(a.id, e.target.value as AdminRole))}
                  className="rounded-lg border border-border px-2 py-1 text-xs"
                >
                  <option value="admin">Admin</option>
                  <option value="owner">Owner</option>
                </select>
                <button
                  type="button"
                  disabled={pending || a.user_id === currentUserId}
                  onClick={() => handleRemove(a.id)}
                  className="text-xs text-danger hover:underline disabled:opacity-40"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
        {rowError && <p className="mt-2 text-xs text-danger">{rowError}</p>}
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold text-foreground">Invite someone</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          They&apos;ll be linked automatically the first time they sign in with this email at /admin/login.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="text-xs text-muted-foreground">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="mt-1 block w-full rounded-lg border border-border px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Name (optional)
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-border px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Role
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as AdminRole)}
              className="mt-1 block w-full rounded-lg border border-border px-2 py-2 text-sm"
            >
              <option value="admin">Admin</option>
              <option value="owner">Owner</option>
            </select>
          </label>
        </div>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        <button
          type="button"
          disabled={pending || !email.trim()}
          onClick={handleInvite}
          className="mt-3 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground disabled:opacity-60"
        >
          {pending ? "Saving…" : "Invite"}
        </button>
      </div>
    </div>
  );
}
