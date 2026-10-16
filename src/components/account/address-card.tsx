"use client";

import { useState, useTransition } from "react";
import { removeAddressAction, updateAddressAction } from "@/lib/actions/customer";
import type { CustomerAddress } from "@/lib/types";

const inputClass = "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-brand";

export function AddressCard({ address }: { address: CustomerAddress }) {
  const [editing, setEditing] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await updateAddressAction(address.id, {
        label: String(formData.get("label") ?? ""),
        line1: String(formData.get("line1") ?? ""),
        line2: String(formData.get("line2") ?? ""),
        city: String(formData.get("city") ?? ""),
        postcode: String(formData.get("postcode") ?? ""),
        accessNotes: String(formData.get("accessNotes") ?? ""),
        isDefault: formData.get("isDefault") === "on",
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setEditing(false);
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await removeAddressAction(address.id);
      if ("error" in result) {
        setError(result.error);
        setConfirmingRemove(false);
      }
    });
  }

  if (editing) {
    return (
      <form action={save} className="space-y-3 rounded-xl border border-brand bg-card p-4">
        <input name="label" defaultValue={address.label} placeholder="Label (e.g. Home)" className={inputClass} />
        <input name="line1" required defaultValue={address.line1} placeholder="Address line 1" className={inputClass} />
        <input name="line2" defaultValue={address.line2 ?? ""} placeholder="Address line 2 (optional)" className={inputClass} />
        <div className="flex gap-3">
          <input name="city" required defaultValue={address.city} placeholder="City" className={`${inputClass} w-1/2`} />
          <input name="postcode" required defaultValue={address.postcode} placeholder="Postcode" className={`${inputClass} w-1/2`} />
        </div>
        <textarea
          name="accessNotes"
          defaultValue={address.access_notes ?? ""}
          placeholder="Access notes for your cleaner (gate code, key location, pets, etc.)"
          className={inputClass}
        />
        {!address.is_default && (
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" name="isDefault" /> Use as my main address
          </label>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save changes"}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setError(null);
            }}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-foreground">
            {address.label}
            {address.is_default && (
              <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Main</span>
            )}
          </p>
          <p className="text-sm text-muted-foreground">
            {address.line1}
            {address.line2 ? `, ${address.line2}` : ""}, {address.city} {address.postcode}
          </p>
          {address.access_notes && <p className="mt-1 text-xs text-muted-foreground">Access: {address.access_notes}</p>}
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
          >
            Edit
          </button>
          {confirmingRemove ? (
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="rounded-lg bg-danger px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {pending ? "Removing…" : "Confirm"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingRemove(true)}
              className="rounded-lg border border-danger px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger/5"
            >
              Remove
            </button>
          )}
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
