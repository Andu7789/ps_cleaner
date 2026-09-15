"use client";

import { useRef, useState, useTransition } from "react";
import { uploadBookingPhotoAction } from "@/lib/actions/cleaner";
import type { PhotoKind } from "@/lib/types";

export function PhotoUpload({ bookingId, kind }: { bookingId: string; kind: PhotoKind }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    startTransition(async () => {
      try {
        await uploadBookingPhotoAction(bookingId, kind, file);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        if (inputRef.current) inputRef.current.value = "";
      }
    });
  }

  return (
    <div>
      <label className="inline-flex cursor-pointer items-center rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-brand hover:border-brand">
        {pending ? "Uploading…" : `Add ${kind} photo`}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          disabled={pending}
          onChange={handleChange}
        />
      </label>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
