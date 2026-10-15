"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { QuickBook, type QuickBookService } from "@/components/home/quick-book";

// A "Returning customer" button under the main call to action. New customers
// follow the big button to book a walkthrough; returning ones open the quick
// book panel to pick any of the cleans straight away.
export function ReturningCustomer({
  services,
  buttonLabel,
  title,
  hint,
  cta,
}: {
  services: QuickBookService[];
  buttonLabel: string;
  title: string;
  hint: string;
  cta: string;
}) {
  const [open, setOpen] = useState(false);
  if (services.length === 0) return null;

  return (
    <div className="mt-4">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="returning-customer-panel"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-full border border-white/40 px-6 py-3 text-base font-medium transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        {buttonLabel}
        <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && (
        <div id="returning-customer-panel" className="ps-clean-fade-in mt-4 max-w-md">
          <QuickBook services={services} title={title} hint={hint} cta={cta} />
        </div>
      )}
    </div>
  );
}
