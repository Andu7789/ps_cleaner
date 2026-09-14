import Link from "next/link";

export function Header({ businessName, signedIn }: { businessName: string; signedIn: boolean }) {
  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-base font-semibold text-foreground">
          {businessName}
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/book" className="text-foreground hover:text-brand">
            Book a clean
          </Link>
          <Link href={signedIn ? "/account" : "/login"} className="font-medium text-brand hover:underline">
            {signedIn ? "My account" : "Sign in"}
          </Link>
        </nav>
      </div>
    </header>
  );
}
