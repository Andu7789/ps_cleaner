import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { DEFAULT_BUSINESS_SLUG } from "@/lib/business";
import { CHECKLIST, type CheckStatus, type ItemState } from "@/lib/checklist-items";
import { fromAddress } from "@/lib/notify";
import { getStripe } from "@/lib/stripe";

// The automatic checks behind the platform portal's checklist. Each one only
// reads: nothing here changes Stripe, DNS, email or any business. A check that
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

const isLive = (key: string | undefined) => /^(sk|rk|pk)_live_/.test(key ?? "");
const present = (name: string) => Boolean(process.env[name]?.trim());

async function stripeChecks(): Promise<Record<string, Result>> {
  const out: Record<string, Result> = {};
  const secret = process.env.STRIPE_SECRET_KEY;
  const publishable = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

  if (!secret) {
    const missing = fail("STRIPE_SECRET_KEY isn't set.");
    for (const key of ["stripe_account", "stripe_verified", "stripe_connect", "stripe_webhook_main", "stripe_webhook_connect"]) out[key] = missing;
  } else {
    const stripe = getStripe();

    let account: Stripe.Account | null = null;
    try {
      account = await withTimeout(stripe.accounts.retrieveCurrent());
      const name = account.business_profile?.name || account.settings?.dashboard?.display_name || account.email || account.id;
      out.stripe_account = pass(`Connected to ${name} in ${isLive(secret) ? "live" : "test"} mode.`);
    } catch (err) {
      out.stripe_account = fail(`Stripe didn't accept the key: ${message(err)}`);
    }

    if (account) {
      const missing = [
        !account.details_submitted && "business details not finished",
        !account.charges_enabled && "can't take payments yet",
        !account.payouts_enabled && "can't pay out yet",
      ].filter(Boolean);
      out.stripe_verified = missing.length === 0 ? pass("Details submitted, payments and payouts are enabled.") : fail(`Still to sort in Stripe: ${missing.join(", ")}.`);
    } else {
      out.stripe_verified = unknown("Couldn't read the account.");
    }

    try {
      await withTimeout(stripe.accounts.list({ limit: 1 }));
      out.stripe_connect = pass("Connect is available on this account.");
    } catch (err) {
      out.stripe_connect = /connect/i.test(message(err)) ? fail("Connect isn't switched on for this account yet.") : unknown(`Couldn't tell: ${message(err)}`);
    }

    try {
      const endpoints = (await withTimeout(stripe.webhookEndpoints.list({ limit: 100 }))).data.filter(
        (e) => e.status === "enabled" && e.url.includes("/api/webhooks/stripe"),
      );
      const hears = (e: Stripe.WebhookEndpoint, event: string) => e.enabled_events.includes("*") || e.enabled_events.includes(event);
      const main = endpoints.find((e) => hears(e, "payment_intent.succeeded"));
      const connect = endpoints.find((e) => hears(e, "account.updated"));
      out.stripe_webhook_main = main ? pass(`Listening at ${main.url}.`) : fail("No enabled webhook for payment_intent.succeeded pointing at /api/webhooks/stripe.");
      out.stripe_webhook_connect = connect ? pass(`Listening at ${connect.url}.`) : fail("No enabled webhook for account.updated pointing at /api/webhooks/stripe.");
    } catch (err) {
      const note = unknown(`Couldn't list webhooks (the key may be restricted): ${message(err)}`);
      out.stripe_webhook_main = note;
      out.stripe_webhook_connect = note;
    }
  }

  if (!secret || !publishable) {
    out.stripe_keys_match = fail(!secret ? "STRIPE_SECRET_KEY isn't set." : "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY isn't set.");
  } else {
    out.stripe_keys_match =
      isLive(secret) === isLive(publishable)
        ? pass(`Both are ${isLive(secret) ? "live" : "test"} keys.`)
        : fail(`The secret key is a ${isLive(secret) ? "live" : "test"} key but the publishable key is a ${isLive(publishable) ? "live" : "test"} key.`);
  }

  const missingSecrets = ["STRIPE_WEBHOOK_SECRET", "STRIPE_CONNECT_WEBHOOK_SECRET"].filter((n) => !present(n));
  out.stripe_secrets = missingSecrets.length === 0 ? pass("Both are set.") : fail(`Not set in Vercel: ${missingSecrets.join(", ")}.`);

  out.stripe_live = isLive(secret) ? pass("Using live keys.") : fail("Still on test keys.");
  return out;
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
  const [stripe, wildcard, emailDomain, deleteFn, testBusinesses] = await Promise.all([
    stripeChecks().catch((err) => ({ __error: unknown(message(err)) }) as Record<string, Result>),
    wildcardCheck(db),
    emailDomainCheck(),
    deleteFunctionCheck(db).catch((err) => unknown(message(err))),
    testBusinessesCheck(db).catch((err) => unknown(message(err))),
  ]);

  const emailOk = present("RESEND_API_KEY") && present("NOTIFY_FROM_EMAIL") && !/example\.com/.test(process.env.NOTIFY_FROM_EMAIL ?? "");
  const results: Record<string, Result> = {
    ...stripe,
    domain_wildcard: wildcard,
    email_configured: emailOk ? pass(`Sending from ${fromAddress(process.env.NOTIFY_FROM_EMAIL)}.`) : fail("RESEND_API_KEY or NOTIFY_FROM_EMAIL isn't set properly."),
    email_domain: emailDomain,
    cron_secret: present("CRON_SECRET") ? pass("Set.") : fail("CRON_SECRET isn't set."),
    delete_function: deleteFn,
    test_businesses: testBusinesses,
  };
  delete results.__error;

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
