import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { NewRequestForm } from "@/components/platform/new-request-form";
import { STATUS_LABEL, completeness, type OnboardingRequest, type OnboardingStatus } from "@/lib/onboarding";

const ORDER: OnboardingStatus[] = ["submitted", "in_progress", "invited", "provisioned", "archived"];

const CHIP: Record<OnboardingStatus, string> = {
  submitted: "bg-brand text-brand-foreground",
  in_progress: "bg-muted text-foreground",
  invited: "bg-muted text-muted-foreground",
  provisioned: "bg-success/15 text-success",
  archived: "bg-muted text-muted-foreground",
};

export default async function PlatformHomePage() {
  const db = createServiceClient();
  const { data } = await db.from("PS_CLEAN_onboarding_requests").select("*").order("created_at", { ascending: false });
  const requests = ((data ?? []) as OnboardingRequest[]).sort(
    (a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status),
  );
  const waiting = requests.filter((r) => r.status === "submitted").length;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">New businesses</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {waiting > 0 ? `${waiting} ready to set up.` : "Send an owner their link, then set them up here once they've filled it in."}
          </p>
        </div>
        <NewRequestForm />
      </div>

      <ul className="mt-6 divide-y divide-border rounded-xl border border-border bg-card">
        {requests.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">Nothing yet. Add the first business.</li>}
        {requests.map((r) => {
          const progress = completeness(r.answers);
          return (
            <li key={r.id}>
              <Link href={`/platform/${r.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{r.business_name || "Unnamed business"}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {r.owner_name || r.owner_email || "No owner yet"}
                    {r.status !== "provisioned" && r.status !== "archived" ? ` · ${progress.done} of ${progress.total} sections` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">{new Date(r.updated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${CHIP[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
