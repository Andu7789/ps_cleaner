import { redirect } from "next/navigation";

// The new design is now the homepage; keep old /demo links working.
export default function DemoRedirect() {
  redirect("/");
}
