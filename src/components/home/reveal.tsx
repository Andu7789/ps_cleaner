"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

// Scroll reveal in the style of the MessageHome / Creativo pages (AOS): the
// block zooms up from 60% (or fades up) once, when it scrolls into view, with
// a small stagger by column. It only hides the block after the page has loaded
// in the browser, so with no JavaScript or reduced motion everything just shows.
export function Reveal({
  children,
  variant = "zoom-in",
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  variant?: "zoom-in" | "fade-up";
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.dataset.reveal = "hidden";
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        el.dataset.reveal = "shown";
        observer.disconnect();
      },
      { rootMargin: "0px 0px -10% 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      data-variant={variant}
      className={className}
      style={{ ["--reveal-delay" as string]: `${delay}ms` }}
    >
      {children}
    </div>
  );
}
