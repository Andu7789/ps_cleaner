import type { ReactNode } from "react";
import { Bricolage_Grotesque } from "next/font/google";

// Display face for the demo only: a friendly grotesque with a bit of character,
// used for headings and prices. Body text keeps the site's Geist.
const display = Bricolage_Grotesque({ variable: "--font-demo-display", subsets: ["latin"] });

export default function DemoLayout({ children }: { children: ReactNode }) {
  return <div className={display.variable}>{children}</div>;
}
