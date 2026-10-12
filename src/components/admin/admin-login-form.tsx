"use client";

import { useState } from "react";
import { adminSignInAction, requestAdminPasswordSetupAction } from "@/lib/actions/admin-auth";

const inputClass =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-brand";

export function AdminLoginForm({ initialError }: { initialError?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [pending, setPending] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await adminSignInAction(email, password);
    } catch (err) {
      // A successful sign-in redirects, which surfaces as a thrown redirect
      // signal that must not be shown as an error.
      if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
      setError(err instanceof Error ? err.message : "Something went wrong");
      setPending(false);
    }
  }

  async function handleForgot() {
    if (!email) {
      setError("Enter your email first.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await requestAdminPasswordSetupAction(email);
      setResetSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  }

  if (resetSent) {
    return (
      <div className="text-center">
        <h1 className="text-xl font-semibold text-foreground">Check your email</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          If {email} is an admin account, we&apos;ve sent a link to set a new password.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground">Sign in</h1>
      <form onSubmit={handleSubmit} className="mt-6 space-y-3">
        <input
          type="email"
          required
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className={inputClass}
        />
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className={inputClass}
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-brand px-4 py-2 font-semibold text-brand-foreground disabled:opacity-60"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <button
        type="button"
        onClick={handleForgot}
        disabled={pending}
        className="mt-3 w-full text-center text-sm text-muted-foreground underline disabled:opacity-60"
      >
        Forgot password or first time here?
      </button>
    </div>
  );
}
