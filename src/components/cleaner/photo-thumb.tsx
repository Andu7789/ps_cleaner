"use client";

import { useTransition } from "react";
import { deleteBookingPhotoAction } from "@/lib/actions/cleaner";

export function PhotoThumb({ photoId, url }: { photoId: string; url: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="relative">
      {/* eslint-disable-next-line @next/next/no-img-element -- signed Supabase Storage URL, not an optimizable local/remote asset */}
      <img src={url} alt="Job photo" className="h-24 w-24 rounded-lg object-cover" />
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => deleteBookingPhotoAction(photoId))}
        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-card text-xs text-danger shadow disabled:opacity-60"
        aria-label="Remove photo"
      >
        &times;
      </button>
    </div>
  );
}
