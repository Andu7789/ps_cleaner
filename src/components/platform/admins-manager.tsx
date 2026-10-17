"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addPlatformAdminAction, removePlatformAdminAction } from "@/lib/actions/platform";

export interface AdminRow {
  id: string;
  email: string;
  signedIn: boolean;
  isYou: boolean;
}

export function AdminsManager({ admins }: { admins: AdminRow[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await addPlatformAdminAction(email);
      if (!result.ok) {
        setError(result.error ?? "Couldn't add them.");
        return;
      }
      setNotice(`${email.trim().toLowerCase()} can now sign in at /platform/login.`);
      setEmail("");
      router.refresh();
    });
  }

  function remove(row: AdminRow) {
    if (!confirm(`Remove ${row.email} as a platform admin? They'll lose access to the platform portal straight away.`)) return;
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await removePlatformAdminAction(row.id);
      if (!result.ok) {
        setError(result.error ?? "Couldn't remove them.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div>
      <ul className="divide-y divide-border rounded-xl border border-border bg-card">
        {admins.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {a.email}
                {a.isYou && <span className="ml-2 text-xs font-normal text-muted-foreground">(you)</span>}
              </p>
              <p className="text-xs text-muted-foreground">{a.signedIn ? "Has signed in" : "Invited, hasn't signed in yet"}</p>
            </div>
            {!a.isYou && (
              <button type="button" disabled={pending} onClick={() => remove(a)} className="text-sm text-danger underline disabled:opacity-60">
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>

      <form onSubmit={add} className="mt-5 rounded-xl border border-border bg-card p-4">
        <label className="block text-sm font-medium text-foreground">
          Add a platform admin
          <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
            They sign in at /platform/login with &quot;Forgot password or first time here?&quot; using this email.
          </span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            className="mt-2 block w-full max-w-sm rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70"
          />
        </label>
        {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
        {notice && <p role="status" className="mt-3 text-sm text-success">{notice}</p>}
        <button type="submit" disabled={pending} className="mt-3 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground disabled:opacity-60">
          {pending ? "Adding…" : "Add admin"}
        </button>
      </form>
    </div>
  );
}
