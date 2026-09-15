"use client";

import { useState } from "react";

export function CopyLinkButton({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(link);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard API can be unavailable (older browser, non-HTTPS
          // context) — the link is still shown as selectable text, so
          // failing silently here just means "no toast," not "no way to share."
        }
      }}
      className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-brand-foreground"
    >
      {copied ? "Copied!" : "Copy link"}
    </button>
  );
}
