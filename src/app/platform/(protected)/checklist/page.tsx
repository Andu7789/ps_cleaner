import { ChecklistPanel } from "@/components/platform/checklist-panel";
import { loadChecklistState } from "@/lib/platform-checklist";
import { createServiceClient } from "@/lib/supabase/server";

export default async function PlatformChecklistPage() {
  const { state, ready } = await loadChecklistState(createServiceClient());

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground">What&apos;s left to do</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Things to finish before taking real payments and onboarding real clients. The site checks what it can by itself, and the rest you tick by hand.
      </p>
      <div className="mt-5">
        <ChecklistPanel initial={state} ready={ready} />
      </div>
    </div>
  );
}
