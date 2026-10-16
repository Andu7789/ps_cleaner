"use client";

import type { ReactNode } from "react";

// An in page link that glides to its target instead of jumping, and falls
// back to a plain jump for anyone who has asked for reduced motion.
export function ScrollLink({ targetId, className, children }: { targetId: string; className?: string; children: ReactNode }) {
  return (
    <a
      href={`#${targetId}`}
      className={className}
      onClick={(e) => {
        const el = document.getElementById(targetId);
        if (!el) return;
        e.preventDefault();
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      }}
    >
      {children}
    </a>
  );
}
