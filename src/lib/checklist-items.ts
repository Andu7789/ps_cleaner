// The platform portal's list of what is left before going live. Each item is
// either checked by the app ("auto", see platform-checklist.ts) or ticked by
// hand ("manual", for things only a person can judge). Client safe: this file
// is only wording and structure.

export type ItemKind = "auto" | "manual";
export type CheckStatus = "pass" | "fail" | "unknown";

export interface ChecklistItem {
  key: string;
  group: string;
  title: string;
  // What to do if it isn't done yet.
  todo: string;
  kind: ItemKind;
}

export const CHECKLIST_GROUPS = ["Domains", "Email and texts", "Platform", "Before the first real client"] as const;

export const CHECKLIST: ChecklistItem[] = [
  // Domains
  { key: "domain_wildcard", group: "Domains", kind: "auto", title: "New business addresses (*.psclean.site) work", todo: "Check the wildcard domain and DNS record in Vercel." },

  // Email and texts
  { key: "email_configured", group: "Email and texts", kind: "auto", title: "Email sending is configured", todo: "Set RESEND_API_KEY and NOTIFY_FROM_EMAIL in Vercel." },
  { key: "email_domain", group: "Email and texts", kind: "auto", title: "The sending domain is verified with Resend", todo: "Verify the domain in Resend (DKIM, SPF and MX records)." },
  { key: "cron_secret", group: "Email and texts", kind: "auto", title: "Scheduled jobs are protected", todo: "Set CRON_SECRET in Vercel so reminders and cleanups can run." },
  { key: "overdue_schedule", group: "Email and texts", kind: "auto", title: "Overdue job alerts are scheduled", todo: "Run migrations 0051 and 0052 in the Supabase SQL editor." },
  { key: "sms_decided", group: "Email and texts", kind: "manual", title: "Decided how text messages work", todo: "Every business uses your one Twilio number. Decide whether that's fine." },

  // Platform
  { key: "delete_function", group: "Platform", kind: "auto", title: "Delete business is installed in the database", todo: "Run migration 0049 in the Supabase SQL editor." },
  { key: "test_businesses", group: "Platform", kind: "auto", title: "No test businesses left", todo: "Delete throwaway businesses from the danger zone on their page." },

  // First real client
  { key: "client_phone", group: "Before the first real client", kind: "manual", title: "Walked through the owner form on a phone", todo: "Open an owner link on your phone and fill it in." },
  { key: "client_welcome", group: "Before the first real client", kind: "manual", title: "Set up a test business and checked the welcome email", todo: "Provision a test business and use the password link from the email." },
  { key: "client_settings", group: "Before the first real client", kind: "manual", title: "Checked an owner can upload a logo", todo: "Sign in as the test owner and open Settings." },
];

export interface ItemState {
  done: boolean;
  status: CheckStatus | null;
  detail: string | null;
  checked_at: string | null;
}

// Whether an item counts as finished, and if not, whether we simply couldn't tell.
export function itemOutcome(item: ChecklistItem, state: ItemState | undefined): "done" | "left" | "unchecked" | "unknown" {
  if (item.kind === "manual") return state?.done ? "done" : "left";
  if (!state?.status) return "unchecked";
  if (state.status === "pass") return "done";
  if (state.status === "unknown") return "unknown";
  return "left";
}
