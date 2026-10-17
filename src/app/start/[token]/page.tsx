import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OnboardingForm } from "@/components/onboarding/onboarding-form";
import { loadRequestByToken } from "@/lib/onboarding-server";

export const metadata: Metadata = {
  title: { absolute: "Set up your booking site" },
  robots: { index: false, follow: false },
};

export default async function StartPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const req = await loadRequestByToken(token);
  if (!req) notFound();

  if (req.status === "provisioned" || req.status === "archived") {
    return (
      <div data-bare-page className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {req.status === "provisioned" ? "You're all set up" : "This link is closed"}
        </h1>
        <p className="mt-2 text-[15px] text-muted-foreground">
          {req.status === "provisioned"
            ? "Your booking site has been created. Check your email for how to sign in."
            : "Get in touch if you still need to set up your business."}
        </p>
      </div>
    );
  }

  return <OnboardingForm token={token} initial={req.answers} alreadySubmitted={req.status === "submitted"} />;
}
