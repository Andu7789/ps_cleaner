"use client";

import { useState, useTransition } from "react";
import { saveKeyBoxCodeAction } from "@/lib/actions/admin";

// The owner enters the key box code here; the cleaner sees it on their job.
// It is kept on the address, so the next booking at the same home has it too.
export function KeyBoxForm({ addressId, initialCode }: { addressId: string; initialCode: string | null }) {
  const [code, setCode] = useState(initialCode ?? "");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setMessage(null);
        startTransition(async () => {
          const result = await saveKeyBoxCodeAction(addressId, code);
          setMessage(result?.error ? { ok: false, text: result.error } : { ok: true, text: "Saved. The cleaner can see it on the job." });
        });
      }}
      className="mt-2"
    >
      <label htmlFor={`keybox-${addressId}`} className="block text-sm font-medium text-foreground">
        Key box code
      </label>
      <div className="mt-1 flex gap-2">
        <input
          id={`keybox-${addressId}`}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          maxLength={40}
          autoComplete="off"
          spellCheck={false}
          className="w-40 rounded-lg border border-border bg-card px-3 py-1.5 font-mono text-sm tracking-wider text-foreground"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-brand-foreground disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save code"}
        </button>
      </div>
      {message && (
        <p role={message.ok ? "status" : "alert"} className={`mt-1 text-xs ${message.ok ? "text-success" : "text-danger"}`}>
          {message.text}
        </p>
      )}
    </form>
  );
}
