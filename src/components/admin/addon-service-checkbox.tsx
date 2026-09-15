"use client";

import { useTransition } from "react";
import { setServiceAddonAction } from "@/lib/actions/addons";

export function AddonServiceCheckbox({
  serviceId,
  addonId,
  initiallyOffered,
}: {
  serviceId: string;
  addonId: string;
  initiallyOffered: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <input
      type="checkbox"
      defaultChecked={initiallyOffered}
      disabled={pending}
      onChange={(e) => startTransition(() => setServiceAddonAction(serviceId, addonId, e.target.checked))}
      className="h-4 w-4 accent-brand"
    />
  );
}
