import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_BUSINESS_SLUG } from "@/lib/business";
import { CHECKLIST, type CheckStatus, type ItemState } from "@/lib/checklist-items";
import { fromAddress } from "@/lib/notify";

// The automatic checks behind the platform portal's checklist. Each one only
// reads: nothing here changes DNS, email or any business. A check that
// can't tell (a restricted API key, a service that is down) says "unknown"
// rather than guessing, so a tick always means something.

interface Result {
  status: CheckStatus;
  detail: string;
}

const pass = (detail: string): Result => ({ status: "pass", detail });
const fail = (detail: string): Result => ({ status: "fail", detail });
const unknown = (detail: string): Result => ({ status: "unknown", detail });

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function withTimeout<T>(work: Promise<T>, ms = 12000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Took too long to answer")), ms);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const present = (name: string) => Boolean(process.env[name]?.trim());

// The overdue job alert relies on pg_cron calling the site (migration 0052).
async function overdueScheduleCheck(db: SupabaseClient): Promise<Result> {
  const { data, error } = await db.from("PS_CLEAN_private_settings").select("key").eq("key", "cron_key").maybeSingle();
  if (error) return fail("Migration 0051 hasn't been run yet.");
  return data ? pass("The scheduler key exists. Check cron.job in Supabase lists ps-clean-overdue-jobs.") : fail("The scheduler key is missing.");
}

async function wildcardCheck(db: SupabaseClient): Promise<Result> {
  const { data } = await db.from("PS_CLEAN_businesses").select("custom_domain").eq("slug", DEFAULT_BUSINESS_SLUG).maybeSingle();
  const domain = (data?.custom_domain as string | null) ?? "psclean.site";
  const host = `check-${Math.random().toString(36).slice(2, 8)}.${domain}`;
  try {
    const res = await withTimeout(fetch(`https://${host}/`, { redirect: "manual" }), 10000);
    return res.status < 500 ? pass(`An address that doesn't exist yet (${host}) is answered over HTTPS.`) : fail(`${host} returned ${res.status}.`);
  } catch {
    return fail(`${host} isn't reachable. Check the wildcard domain and DNS record in Vercel.`);
  }
}

async function emailDomainCheck(): Promise<Result> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return fail("RESEND_API_KEY isn't set.");
  const domain = fromAddress(process.env.NOTIFY_FROM_EMAIL).split("@")[1];
  if (!domain) return fail("NOTIFY_FROM_EMAIL isn't set to an address.");
  try {
    const res = await withTimeout(fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${key}` } }));
    if (res.status === 401 || res.status === 403) return unknown("This Resend key can only send, so it can't list domains. Check in the Resend dashboard.");
    if (!res.ok) return unknown(`Resend answered ${res.status}.`);
    const body = (await res.json()) as { data?: { name: string; status: string }[] };
    const found = body.data?.find((d) => d.name === domain);
    if (!found) return fail(`${domain} isn't added in Resend.`);
    return found.status === "verified" ? pass(`${domain} is verified.`) : fail(`${domain} is ${found.status} in Resend.`);
  } catch (err) {
    return unknown(`Couldn't reach Resend: ${message(err)}`);
  }
}

async function deleteFunctionCheck(db: SupabaseClient): Promise<Result> {
  // A made up id: if the function exists it stops at "not found" before it
  // deletes anything.
  const { error } = await db.rpc("ps_clean_delete_business", { p_business_id: "00000000-0000-0000-0000-000000000000" });
  if (error && /not found/i.test(error.message) && !/function/i.test(error.message)) return pass("Installed.");
  if (error && /(could not find|does not exist|schema cache)/i.test(error.message)) return fail("Not installed. Run migration 0049.");
  return error ? unknown(error.message) : unknown("Unexpected answer from the database.");
}

async function testBusinessesCheck(db: SupabaseClient): Promise<Result> {
  const { data, error } = await db.from("PS_CLEAN_businesses").select("slug").neq("slug", DEFAULT_BUSINESS_SLUG);
  if (error) return unknown(error.message);
  const slugs = (data ?? []).map((b) => b.slug as string);
  return slugs.length === 0 ? pass("Only the main business exists.") : fail(`${slugs.length} to delete: ${slugs.join(", ")}.`);
}

// Runs every automatic check at once and remembers each answer.
export async function runChecklist(db: SupabaseClient): Promise<Record<string, Result>> {
  const [overdue, wildcard, emailDomain, deleteFn, testBusinesses] = await Promise.all([
    overdueScheduleCheck(db).catch((err) => unknown(message(err))),
    wildcardCheck(db),
    emailDomainCheck(),
    deleteFunctionCheck(db).catch((err) => unknown(message(err))),
    testBusinessesCheck(db).catch((err) => unknown(message(err))),
  ]);

  const emailOk = present("RESEND_API_KEY") && present("NOTIFY_FROM_EMAIL") && !/example\.com/.test(process.env.NOTIFY_FROM_EMAIL ?? "");
  const results: Record<string, Result> = {
    overdue_schedule: overdue,
    domain_wildcard: wildcard,
    email_configured: emailOk ? pass(`Sending from ${fromAddress(process.env.NOTIFY_FROM_EMAIL)}.`) : fail("RESEND_API_KEY or NOTIFY_FROM_EMAIL isn't set properly."),
    email_domain: emailDomain,
    cron_secret: present("CRON_SECRET") ? pass("Set.") : fail("CRON_SECRET isn't set."),
    delete_function: deleteFn,
    test_businesses: testBusinesses,
  };

  const now = new Date().toISOString();
  const autoKeys = CHECKLIST.filter((i) => i.kind === "auto").map((i) => i.key);
  const rows = autoKeys.map((key) => ({
    item_key: key,
    status: (results[key] ?? unknown("No answer.")).status,
    detail: (results[key] ?? unknown("No answer.")).detail,
    checked_at: now,
    updated_at: now,
  }));
  await db.from("PS_CLEAN_platform_checklist").upsert(rows, { onConflict: "item_key" });

  return Object.fromEntries(autoKeys.map((k) => [k, results[k] ?? unknown("No answer.")]));
}

// `ready` is false when the checklist table hasn't been created yet
// (migration 0050), so the page can say so instead of silently losing ticks.
export async function loadChecklistState(
  db: SupabaseClient,
): Promise<{ state: Record<string, ItemState>; ready: boolean }> {
  const { data, error } = await db.from("PS_CLEAN_platform_checklist").select("item_key, done, status, detail, checked_at");
  if (error) return { state: {}, ready: false };
  return {
    ready: true,
    state: Object.fromEntries(
      (data ?? []).map((r) => [
        r.item_key as string,
        { done: r.done as boolean, status: r.status as CheckStatus | null, detail: r.detail as string | null, checked_at: r.checked_at as string | null },
      ]),
    ),
  };
}
