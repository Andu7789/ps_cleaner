"use client";

import { useTransition } from "react";
import { setCleanerQualificationAction } from "@/lib/actions/admin";

export function QualificationCheckbox({
  cleanerId,
  serviceId,
  initiallyQualified,
}: {
  cleanerId: string;
  serviceId: string;
  initiallyQualified: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <input
      type="checkbox"
      defaultChecked={initiallyQualified}
      disabled={pending}
      onChange={(e) => startTransition(() => setCleanerQualificationAction(cleanerId, serviceId, e.target.checked))}
      className="h-4 w-4 accent-brand"
    />
  );
}
