import type { Metadata } from "next";
import { PasswordLoginForm } from "@/components/auth/password-login-form";
import { platformSignInAction, requestPlatformLoginLinkAction } from "@/lib/actions/platform";

export const metadata: Metadata = { title: { absolute: "Platform sign in" }, robots: { index: false } };

export default async function PlatformLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const errorMessage =
    error === "not_platform_admin"
      ? "That account isn't a platform admin."
      : error
        ? "That link didn't work, it may have expired or already been used. Use \"Forgot password\" for a new one."
        : undefined;
  return (
    <div data-bare-page className="neutral-page mx-auto max-w-sm px-4 py-16">
      <p className="mb-4 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Platform sign in
      </p>
      <PasswordLoginForm
        signIn={platformSignInAction}
        requestSetup={requestPlatformLoginLinkAction}
        setupWho="a platform admin"
        initialError={errorMessage}
      />
    </div>
  );
}
