"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export interface QuickBookService {
  id: string;
  name: string;
  priceLabel: string;
  duration: string;
}

// Service buttons in the hero. Picking one shows its price and time and points
// the booking button at that service, so the first click already counts.
export function QuickBook({
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
  const [selectedId, setSelectedId] = useState(services[0]?.id ?? "");
  const selected = services.find((s) => s.id === selectedId);
  if (services.length === 0) return null;

  return (
    <div className="rounded-3xl bg-white p-5 text-[#1a1116] shadow-[0_24px_60px_-20px_rgba(0,0,0,0.55)] sm:p-6">
      <h2 className="text-lg font-semibold [font-family:var(--font-demo-display)]">{title}</h2>
      <p className="mt-0.5 text-sm text-[#5d5258]">{hint}</p>
      <div role="radiogroup" aria-label="Choose a clean" className="mt-4 flex flex-wrap gap-2">
        {services.map((s) => {
          const on = s.id === selectedId;
          return (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setSelectedId(s.id)}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)] ${
                on
                  ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--brand-foreground)]"
                  : "border-[#e6dde1] bg-white text-[#1a1116] hover:border-[var(--brand)]"
              }`}
            >
              {s.name}
            </button>
          );
        })}
      </div>
      {selected && (
        <div className="mt-4 flex items-end justify-between gap-3 border-t border-[#efe7ea] pt-4">
          <div aria-live="polite">
            <p className="text-xl font-semibold text-[var(--brand)] [font-family:var(--font-demo-display)]">{selected.priceLabel}</p>
            <p className="text-sm text-[#5d5258]">{selected.duration}</p>
          </div>
          <Link
            href={`/book/${selected.id}`}
            className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-[var(--brand)] px-5 py-3 text-sm font-semibold text-[var(--brand-foreground)] transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]"
          >
            {cta}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      )}
    </div>
  );
}
