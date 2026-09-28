"use client";

import { useState, useTransition } from "react";
import { resendCleanerInviteAction } from "@/lib/actions/admin";

export function ResendCleanerInviteButton({ cleanerId, email }: { cleanerId: string; email: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function handleClick() {
    setMessage(null);
    startTransition(async () => {
      try {
        await resendCleanerInviteAction(cleanerId);
        setMessage({ ok: true, text: `Invite sent to ${email}` });
      } catch (err) {
        setMessage({ ok: false, text: err instanceof Error ? err.message : "Couldn't send the invite" });
      }
    });
  }

  return (
    <div className="flex items-center gap-3">
      {message && (
        <span role="status" className={`text-xs ${message.ok ? "text-muted-foreground" : "text-danger"}`}>
          {message.text}
        </span>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={handleClick}
        className="text-sm font-medium text-brand hover:underline disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send invite email"}
      </button>
    </div>
  );
}
