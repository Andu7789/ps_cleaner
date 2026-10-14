"use client";

import { useState } from "react";
import { ServiceForm } from "@/components/admin/service-form";
import type { Service } from "@/lib/types";

export function ServiceEditor({ service }: { service: Service }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="text-xs font-medium text-brand underline">
        {open ? "Close" : "Edit service"}
      </button>
      {open && (
        <div className="mt-3 rounded-lg border border-border bg-background p-4">
          <ServiceForm service={service} onDone={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
