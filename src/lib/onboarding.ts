import { z } from "zod";

// Shared by the owner's intake form (browser), the server actions that save it
// and the provisioning code, so everyone agrees on one shape. Nothing in here
// touches the server, so it is safe to import from client components.

export const RESERVED_SLUGS = new Set([
  "www", "app", "api", "admin", "platform", "start", "mail", "email", "smtp", "ftp", "send",
  "support", "help", "status", "blog", "docs", "dev", "test", "staging", "demo", "login",
  "account", "book", "cleaner", "assets", "static", "cdn", "billing", "stripe", "psclean",
]);

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #0f766e");
const email = z.string().trim().toLowerCase().email("Enter a valid email address").max(200);
// Optional text is saved without the empty ones, so a missing value must read as blank.
const phone = z.string().trim().max(30).default("");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/, "3 to 40 letters, numbers or hyphens, not starting or ending with a hyphen")
  .refine((s) => !s.includes("--"), "No double hyphens")
  .refine((s) => !RESERVED_SLUGS.has(s), "That address is reserved, please pick another");

const domain = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/, "Enter a domain like www.example.com");

export const serviceSchema = z.object({
  key: z.string().max(40),
  name: z.string().trim().min(1, "Give each service a name").max(80),
  description: z.string().trim().max(300).optional(),
  // hourly: price is per hour. fixed: price is the total. quote: price is an
  // estimate shown as "from" and the owner confirms the real price per job.
  pricing: z.enum(["hourly", "fixed", "quote"]),
  price: z.number().min(0).max(100000),
  minutes: z.number().int().min(10).max(720),
  travelMinutes: z.number().int().min(0).max(180),
  // A free visit before quoting: collects room counts for the cleaner.
  walkthrough: z.boolean(),
});

export const cleanerSchema = z.object({
  key: z.string().max(40),
  name: z.string().trim().min(1, "Give each cleaner a name").max(80),
  email: email.or(z.literal("")).default(""),
  phone,
});

export const dayHoursSchema = z.object({
  day: z.number().int().min(0).max(6),
  on: z.boolean(),
  start: time,
  end: time,
});

export const answersSchema = z.object({
  owner: z.object({
    name: z.string().trim().min(1, "Your name is needed").max(80),
    email,
    phone,
  }),
  business: z.object({
    name: z.string().trim().min(2, "Your business name is needed").max(80),
    contactEmail: email.or(z.literal("")).default(""),
    contactPhone: phone,
    area: z.string().trim().max(200).default(""),
  }),
  address: z.object({
    slug: slugSchema,
    customDomain: domain.or(z.literal("")).default(""),
  }),
  brand: z.object({
    color: hex,
    headerStyle: z.enum(["light", "brand"]).default("light"),
    logoUrl: z.string().url().max(500).or(z.literal("")).default(""),
    iconUrl: z.string().url().max(500).or(z.literal("")).default(""),
  }),
  services: z.array(serviceSchema).min(1, "Add at least one service").max(12),
  team: z.object({
    ownerCleans: z.boolean(),
    cleaners: z.array(cleanerSchema).max(20),
  }),
  hours: z.object({
    timezone: z.string().min(1).max(60),
    days: z.array(dayHoursSchema).length(7),
  }),
  payments: z.object({
    method: z.enum(["stripe", "later", "unsure"]).default("unsure"),
    notes: z.string().trim().max(500).default(""),
  }),
  notes: z.string().trim().max(1000).default(""),
});

export type Answers = z.infer<typeof answersSchema>;
export type ServiceAnswer = z.infer<typeof serviceSchema>;
export type CleanerAnswer = z.infer<typeof cleanerSchema>;
export type DayHours = z.infer<typeof dayHoursSchema>;

// A saved draft can be missing anything the owner hasn't reached yet.
export const draftSchema = answersSchema.deepPartial();
export type Draft = z.infer<typeof draftSchema>;

// The parts of the form, as the review page groups them.
export type Section = "owner" | "business" | "address" | "brand" | "services" | "team" | "payments";

export interface Issue {
  section: Section;
  message: string;
}

export const SECTION_LABEL: Record<Section, string> = {
  owner: "You",
  business: "Business",
  address: "Web address",
  brand: "Look",
  services: "Services",
  team: "Team and hours",
  payments: "Payments",
};

// Which form step edits each section, for the Edit buttons.
export const SECTION_STEP: Record<Section, number> = {
  owner: 0,
  business: 0,
  address: 1,
  brand: 2,
  services: 3,
  team: 4,
  payments: 5,
};

function sectionOf(path: (string | number)[]): Section {
  switch (path[0]) {
    case "owner": return "owner";
    case "business": return "business";
    case "address": return "address";
    case "brand": return "brand";
    case "services": return "services";
    case "team":
    case "hours": return "team";
    default: return "payments";
  }
}

function describe(path: (string | number)[], message: string): string {
  const index = typeof path[1] === "number" ? path[1] + 1 : null;
  if (path[0] === "services" && index) return `Service ${index}: ${message}`;
  if (path[0] === "team" && path[1] === "cleaners" && typeof path[2] === "number") return `Cleaner ${path[2] + 1}: ${message}`;
  return message;
}

// Everything still to fix before this can be sent in, each tied to the part
// of the form it belongs to so the review page can count them per section.
// Plain sentences, because the owner reads them.
export function findIssues(draft: unknown): Issue[] {
  const issues: Issue[] = [];
  const parsed = answersSchema.safeParse(draft);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      issues.push({ section: sectionOf(issue.path), message: describe(issue.path, issue.message) });
    }
  }

  const loose = (draft ?? {}) as Draft;
  if (!loose.team?.ownerCleans && (loose.team?.cleaners?.length ?? 0) === 0) {
    issues.push({ section: "team", message: "Add at least one cleaner. If it's just you, tick that you do cleans yourself." });
  }
  const days = loose.hours?.days ?? [];
  if (!days.some((d) => d?.on)) issues.push({ section: "team", message: "Pick at least one working day." });
  for (const d of days) {
    if (d?.on && d.start && d.end && d.end <= d.start) {
      issues.push({ section: "team", message: `${DAY_NAMES[d.day ?? 0]}: the finish time must be after the start time.` });
    }
  }

  const seen = new Set<string>();
  return issues.filter((i) => {
    const key = `${i.section}|${i.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function countBySection(issues: Issue[]): Record<Section, Issue[]> {
  const grouped = { owner: [], business: [], address: [], brand: [], services: [], team: [], payments: [] } as Record<Section, Issue[]>;
  for (const i of issues) grouped[i.section].push(i);
  return grouped;
}

// The full check run before an owner can send the form in and again before
// anything is created.
export function validateAnswers(
  draft: unknown,
): { ok: true; data: Answers } | { ok: false; errors: string[] } {
  const issues = findIssues(draft);
  if (issues.length > 0) return { ok: false, errors: issues.map((i) => i.message) };
  return { ok: true, data: answersSchema.parse(draft) };
}

export type OnboardingStatus = "invited" | "in_progress" | "submitted" | "provisioned" | "archived";

export interface LogEntry {
  step: string;
  ok: boolean;
  detail: string;
  at: string;
}

export interface OnboardingRequest {
  id: string;
  token: string;
  status: OnboardingStatus;
  owner_name: string | null;
  owner_email: string | null;
  business_name: string | null;
  answers: Draft;
  provision_log: LogEntry[];
  business_id: string | null;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  provisioned_at: string | null;
}

export const TOKEN_PATTERN = /^[a-f0-9]{48}$/;

export const STATUS_LABEL: Record<OnboardingStatus, string> = {
  invited: "Invited",
  in_progress: "Filling in",
  submitted: "Ready to set up",
  provisioned: "Live",
  archived: "Archived",
};

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Monday first is how people think about a working week.
export const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function defaultHours(): DayHours[] {
  return [0, 1, 2, 3, 4, 5, 6].map((day) => ({
    day,
    on: day >= 1 && day <= 5,
    start: "09:00",
    end: "17:00",
  }));
}

export interface ServiceTemplate {
  label: string;
  service: Omit<ServiceAnswer, "key">;
}

// One tap starting points, so the owner edits a sensible service rather than
// facing a blank form.
export const SERVICE_TEMPLATES: ServiceTemplate[] = [
  {
    label: "Regular home clean",
    service: { name: "Regular home clean", description: "A thorough regular clean of your whole home.", pricing: "hourly", price: 18, minutes: 120, travelMinutes: 30, walkthrough: false },
  },
  {
    label: "Deep clean",
    service: { name: "Deep clean", description: "A top to bottom clean, including the places a regular clean skips.", pricing: "hourly", price: 20, minutes: 240, travelMinutes: 30, walkthrough: false },
  },
  {
    label: "End of tenancy",
    service: { name: "End of tenancy clean", description: "Get your deposit back. Priced after we know the size of the property.", pricing: "quote", price: 150, minutes: 300, travelMinutes: 30, walkthrough: false },
  },
  {
    label: "Oven clean",
    service: { name: "Oven clean", description: "Oven, hob and extractor cleaned and degreased.", pricing: "fixed", price: 60, minutes: 90, travelMinutes: 30, walkthrough: false },
  },
  {
    label: "Free walkthrough",
    service: { name: "Free walkthrough", description: "We visit, see the job and give you an exact price. No charge.", pricing: "fixed", price: 0, minutes: 30, travelMinutes: 30, walkthrough: true },
  },
];

export function newKey(): string {
  return Math.random().toString(36).slice(2, 10);
}

// "Acme Cleaning Ltd" -> "acme-cleaning"
export function suggestSlug(businessName: string): string {
  return businessName
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(ltd|limited|llp|plc|the)\b/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

// How complete a draft is, for the progress shown to both sides. Counts the
// sections that matter for going live.
export function completeness(draft: Draft): { done: number; total: number; missing: string[] } {
  const checks: [string, boolean][] = [
    ["Your details", Boolean(draft.owner?.name && draft.owner?.email)],
    ["Business name", Boolean(draft.business?.name)],
    ["Web address", Boolean(draft.address?.slug)],
    ["Brand colour", Boolean(draft.brand?.color)],
    ["Services", (draft.services?.length ?? 0) > 0],
    ["Team", Boolean(draft.team?.ownerCleans) || (draft.team?.cleaners?.length ?? 0) > 0],
    ["Working hours", Boolean(draft.hours?.days?.some((d) => d?.on))],
  ];
  return {
    done: checks.filter(([, ok]) => ok).length,
    total: checks.length,
    missing: checks.filter(([, ok]) => !ok).map(([label]) => label),
  };
}

// Pounds typed by a person to whole pence, without float drift.
export function poundsToPence(pounds: number): number {
  return Math.round(pounds * 100);
}
