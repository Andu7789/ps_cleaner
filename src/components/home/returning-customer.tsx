"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { QuickBook, type QuickBookService } from "@/components/home/quick-book";

// The "Returning customer" button sits under the main call to action on the
// left of the hero, and the quick book card it opens appears over the photo on
// the right, so the two share one open/closed state through a small context.
const ReturningContext = createContext<{ open: boolean; toggle: () => void } | null>(null);

function useReturning() {
  const ctx = useContext(ReturningContext);
  if (!ctx) throw new Error("Returning customer parts must sit inside ReturningProvider");
  return ctx;
}

export function ReturningProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <ReturningContext value={{ open, toggle: () => setOpen((v) => !v) }}>{children}</ReturningContext>;
}

export function ReturningButton({ label }: { label: string }) {
  const { open, toggle } = useReturning();
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls="returning-customer-card"
      onClick={toggle}
      className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/40 px-6 py-3 text-base font-medium transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
    >
      {label}
      <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
    </button>
  );
}

export function ReturningCard({
  services,
  title,
  hint,
  cta,
}: {
  services: QuickBookService[];
  title: string;
  hint: string;
  cta: string;
}) {
  const { open } = useReturning();
  const ref = useRef<HTMLDivElement>(null);

  // On a phone the card lands below the photo, so bring it into view.
  useEffect(() => {
    if (open) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [open]);

  if (!open || services.length === 0) return null;

  return (
    <div
      ref={ref}
      id="returning-customer-card"
      className="ps-clean-fade-in relative z-10 -mt-16 px-3 lg:-mt-24 lg:-ml-10 lg:mr-auto lg:max-w-sm lg:px-0"
    >
      <QuickBook services={services} title={title} hint={hint} cta={cta} />
    </div>
  );
}
