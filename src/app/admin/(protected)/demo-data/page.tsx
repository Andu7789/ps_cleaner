import { requireAdmin } from "@/lib/auth";
import { DemoDataButtons } from "@/components/admin/demo-data-buttons";

export default async function AdminDemoDataPage() {
  await requireAdmin();

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground">Demo data</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Quick one-press tools for demoing features with real data, without needing to run SQL by hand.
      </p>
      <div className="mt-4">
        <DemoDataButtons />
      </div>
    </div>
  );
}
