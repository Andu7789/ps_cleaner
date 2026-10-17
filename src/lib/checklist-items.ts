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

export const CHECKLIST_GROUPS = ["Stripe", "Domains", "Email and texts", "Platform", "Before the first real client"] as const;

export const CHECKLIST: ChecklistItem[] = [
  // Stripe
  { key: "stripe_account", group: "Stripe", kind: "auto", title: "A Stripe account is connected", todo: "Put the Stripe secret key in Vercel (STRIPE_SECRET_KEY) and redeploy." },
  { key: "stripe_verified", group: "Stripe", kind: "auto", title: "The Stripe account is fully verified", todo: "Finish business verification in the Stripe dashboard so it can take payments and pay out." },
  { key: "stripe_connect", group: "Stripe", kind: "auto", title: "Connect is switched on", todo: "In Stripe, open Settings, then Connect, and complete the platform set up (Express accounts, United Kingdom)." },
  { key: "stripe_keys_match", group: "Stripe", kind: "auto", title: "Secret and publishable keys are from the same mode", todo: "Make sure STRIPE_SECRET_KEY and NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY are both test keys or both live keys." },
  { key: "stripe_webhook_main", group: "Stripe", kind: "auto", title: "The payments webhook is registered in Stripe", todo: "Add a webhook to https://psclean.site/api/webhooks/stripe for payment_intent.succeeded, payment_intent.payment_failed and charge.refunded." },
  { key: "stripe_webhook_connect", group: "Stripe", kind: "auto", title: "The Connect webhook is registered in Stripe", todo: "Add a second webhook, same URL, set to listen to events on connected accounts, for account.updated." },
  { key: "stripe_secrets", group: "Stripe", kind: "auto", title: "Both webhook secrets are saved in Vercel", todo: "Copy each webhook's signing secret into STRIPE_WEBHOOK_SECRET and STRIPE_CONNECT_WEBHOOK_SECRET, then redeploy." },
  { key: "stripe_tested_platform", group: "Stripe", kind: "manual", title: "Tested a booking on the platform account", todo: "In test mode, book and pay on a business set to the platform Stripe account." },
  { key: "stripe_tested_connect", group: "Stripe", kind: "manual", title: "Tested a booking on an owner's own account", todo: "In test mode, finish Stripe set up on a business set to the owner's own account, then book and pay." },
  { key: "stripe_refund", group: "Stripe", kind: "manual", title: "Agreed with Paige how refunds work", todo: "She is the account holder. For a payment sent on to an owner, tick reverse transfer when refunding." },
  { key: "stripe_billing", group: "Stripe", kind: "manual", title: "Decided how to bill Paige per new account", todo: "Nothing in the app does this yet. Decide the amount and how often." },
  { key: "stripe_test_data", group: "Stripe", kind: "manual", title: "Cleared test bookings before going live", todo: "Saved cards and payments belong to the old Stripe account and won't carry over." },
  { key: "stripe_live", group: "Stripe", kind: "auto", title: "Switched to live Stripe keys", todo: "Last step. Swap in the live keys and webhook secrets in Vercel, then redeploy." },

  // Domains
  { key: "domain_wildcard", group: "Domains", kind: "auto", title: "New business addresses (*.psclean.site) work", todo: "Check the wildcard domain and DNS record in Vercel." },

  // Email and texts
  { key: "email_configured", group: "Email and texts", kind: "auto", title: "Email sending is configured", todo: "Set RESEND_API_KEY and NOTIFY_FROM_EMAIL in Vercel." },
  { key: "email_domain", group: "Email and texts", kind: "auto", title: "The sending domain is verified with Resend", todo: "Verify the domain in Resend (DKIM, SPF and MX records)." },
  { key: "cron_secret", group: "Email and texts", kind: "auto", title: "Scheduled jobs are protected", todo: "Set CRON_SECRET in Vercel so reminders and cleanups can run." },
  { key: "sms_decided", group: "Email and texts", kind: "manual", title: "Decided how text messages work", todo: "Every business uses your one Twilio number. Decide whether that's fine." },

  // Platform
  { key: "delete_function", group: "Platform", kind: "auto", title: "Delete business is installed in the database", todo: "Run migration 0049 in the Supabase SQL editor." },
  { key: "test_businesses", group: "Platform", kind: "auto", title: "No test businesses left", todo: "Delete throwaway businesses from the danger zone on their page." },

  // First real client
  { key: "client_phone", group: "Before the first real client", kind: "manual", title: "Walked through the owner form on a phone", todo: "Open an owner link on your phone and fill it in." },
  { key: "client_welcome", group: "Before the first real client", kind: "manual", title: "Set up a test business and checked the welcome email", todo: "Provision a test business and use the password link from the email." },
  { key: "client_settings", group: "Before the first real client", kind: "manual", title: "Checked an owner can upload a logo and see card payments", todo: "Sign in as the test owner and open Settings." },
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
