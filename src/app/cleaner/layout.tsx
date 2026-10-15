import type { Metadata } from "next";
import type { ReactNode } from "react";

// Points every cleaner page at the cleaner app manifest, so "Add to Home
// Screen" from here installs an app that opens the cleaner screen.
export const metadata: Metadata = {
  manifest: "/cleaner/manifest.webmanifest",
  title: { default: "Cleaner", template: "%s · Cleaner" },
};

export default function CleanerRootLayout({ children }: { children: ReactNode }) {
  return children;
}
