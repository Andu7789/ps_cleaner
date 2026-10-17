"use client";

import { useEffect, useRef, useState } from "react";
import { saveDraftAction, submitOnboardingAction } from "@/lib/actions/onboarding";
import { brandVars } from "@/lib/branding";
import {
  DAY_NAMES,
  DAY_ORDER,
  defaultHours,
  newKey,
  poundsToPence,
  type Answers,
  type Draft,
} from "@/lib/onboarding";
import { formatPence } from "@/lib/format";
import { StepHeading } from "./form-parts";
import {
  AddressStep,
  BrandStep,
  PaymentsStep,
  ServicesStep,
  TeamStep,
  YouStep,
} from "./onboarding-steps";

const STEPS = ["You", "Address", "Brand", "Services", "Team", "Payments", "Review"];

function hydrate(d: Draft): Answers {
  const days = defaultHours().map((def) => {
    const saved = d.hours?.days?.find((x) => x?.day === def.day);
    return { day: def.day, on: saved?.on ?? def.on, start: saved?.start ?? def.start, end: saved?.end ?? def.end };
  });
  return {
    owner: { name: d.owner?.name ?? "", email: d.owner?.email ?? "", phone: d.owner?.phone ?? "" },
    business: {
      name: d.business?.name ?? "",
      contactEmail: d.business?.contactEmail ?? "",
      contactPhone: d.business?.contactPhone ?? "",
      area: d.business?.area ?? "",
    },
    address: { slug: d.address?.slug ?? "", customDomain: d.address?.customDomain ?? "" },
    brand: {
      color: d.brand?.color ?? "#0f766e",
      headerStyle: d.brand?.headerStyle ?? "light",
      logoUrl: d.brand?.logoUrl ?? "",
      iconUrl: d.brand?.iconUrl ?? "",
    },
    services: (d.services ?? []).map((s) => ({
      key: s?.key ?? newKey(),
      name: s?.name ?? "",
      description: s?.description ?? "",
      pricing: s?.pricing ?? "hourly",
      price: s?.price ?? 0,
      minutes: s?.minutes ?? 120,
      travelMinutes: s?.travelMinutes ?? 30,
      walkthrough: s?.walkthrough ?? false,
    })),
    team: {
      ownerCleans: d.team?.ownerCleans ?? false,
      cleaners: (d.team?.cleaners ?? []).map((c) => ({
        key: c?.key ?? newKey(),
        name: c?.name ?? "",
        email: c?.email ?? "",
        phone: c?.phone ?? "",
      })),
    },
    hours: { timezone: d.hours?.timezone ?? "Europe/London", days },
    payments: { method: d.payments?.method ?? "unsure", notes: d.payments?.notes ?? "" },
    notes: d.notes ?? "",
  };
}

// Empty strings are "not answered yet", and the saved draft must not treat
// them as answers (an empty email isn't a valid email).
function prune(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(prune);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== "")
        .map(([k, v]) => [k, prune(v)]),
    );
  }
  return value;
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function stepProblem(step: number, a: Answers, slugOk: boolean | null): string | null {
  if (step === 0) {
    if (!a.owner.name.trim()) return "Add your name.";
    if (!EMAIL.test(a.owner.email.trim())) return "Add a valid email so you can sign in.";
    if (a.business.name.trim().length < 2) return "Add your business name.";
  }
  if (step === 1) {
    if (a.address.slug.length < 3) return "Choose an address of at least three characters.";
    if (slugOk === false) return "That address isn't available. Try another.";
    if (slugOk === null) return "Hold on a second while we check your address.";
  }
  if (step === 3) {
    if (a.services.length === 0) return "Add at least one service.";
    if (a.services.some((s) => !s.name.trim())) return "Give every service a name.";
  }
  if (step === 4) {
    if (!a.team.ownerCleans && a.team.cleaners.length === 0) return "Add a cleaner. If it's just you, tick “I do cleans myself”.";
    if (a.team.cleaners.some((c) => !c.name.trim())) return "Give every cleaner a name.";
    if (a.team.cleaners.some((c) => c.email && !EMAIL.test(c.email))) return "One of the cleaner emails doesn't look right.";
    if (!a.hours.days.some((d) => d.on)) return "Pick at least one working day.";
    const bad = a.hours.days.find((d) => d.on && d.end <= d.start);
    if (bad) return `${DAY_NAMES[bad.day]} finishes before it starts.`;
  }
  return null;
}

type SaveState = "idle" | "saving" | "saved" | "error";

export function OnboardingForm({
  token,
  initial,
  alreadySubmitted,
}: {
  token: string;
  initial: Draft;
  alreadySubmitted: boolean;
}) {
  const [answers, setAnswers] = useState<Answers>(() => hydrate(initial));
  const [step, setStep] = useState(0);
  const [slugState, setSlugState] = useState<{ status: "idle" | "checking" | "ok" | "bad"; message: string }>({
    status: "idle",
    message: "",
  });
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [problem, setProblem] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(alreadySubmitted);
  const [paused, setPaused] = useState(false);
  const dirty = useRef(false);
  const latest = useRef(answers);

  async function save(): Promise<boolean> {
    setSaveState("saving");
    const result = await saveDraftAction(token, prune(latest.current));
    setSaveState(result.ok ? "saved" : "error");
    if (result.ok) dirty.current = false;
    return result.ok;
  }

  function update(updater: (a: Answers) => Answers) {
    dirty.current = true;
    setAnswers((prev) => {
      const next = updater(prev);
      latest.current = next;
      return next;
    });
    setProblem(null);
  }

  // Saves a moment after the last change, so nothing is lost if they close the tab.
  useEffect(() => {
    if (!dirty.current || sent) return;
    const timer = setTimeout(() => {
      void save();
    }, 1200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- save reads the latest answers from a ref
  }, [answers, sent]);

  const slugOk = slugState.status === "ok" ? true : slugState.status === "bad" ? false : null;

  async function next() {
    const issue = stepProblem(step, answers, slugOk);
    if (issue) {
      setProblem(issue);
      return;
    }
    await save();
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function back() {
    setProblem(null);
    setStep((s) => Math.max(s - 1, 0));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function finishLater() {
    if (await save()) setPaused(true);
  }

  async function submit() {
    setSubmitting(true);
    setServerErrors([]);
    if (!(await save())) {
      setServerErrors(["We couldn't save your answers. Check your connection and try again."]);
      setSubmitting(false);
      return;
    }
    const result = await submitOnboardingAction(token);
    setSubmitting(false);
    if (result.ok) {
      setSent(true);
      window.scrollTo({ top: 0 });
    } else {
      setServerErrors(result.errors);
    }
  }

  const vars = brandVars({ brand_color: answers.brand.color, background_style: "neutral", background_color: null });

  if (sent) {
    return (
      <Shell vars={vars}>
        <div className="py-16 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand text-brand-foreground" aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          </div>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-foreground">That&apos;s everything, thank you</h1>
          <p className="mx-auto mt-2 max-w-md text-[15px] text-muted-foreground">
            We&apos;re setting up {answers.business.name || "your business"} now. We&apos;ll email {answers.owner.email} when it&apos;s ready to use, usually within a day.
          </p>
          <button type="button" onClick={() => setSent(false)} className="mt-6 text-sm text-muted-foreground underline">
            I need to change something
          </button>
        </div>
      </Shell>
    );
  }

  if (paused) {
    return (
      <Shell vars={vars}>
        <div className="py-16 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Saved, come back any time</h1>
          <p className="mx-auto mt-2 max-w-md text-[15px] text-muted-foreground">
            Everything you&apos;ve entered is kept. Open the same link again to carry on where you left off.
          </p>
          <button type="button" onClick={() => setPaused(false)} className="mt-6 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground">
            Keep going now
          </button>
        </div>
      </Shell>
    );
  }

  const last = step === STEPS.length - 1;

  return (
    <Shell vars={vars}>
      <nav aria-label="Progress" className="mb-8">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Step {step + 1} of {STEPS.length}: {STEPS[step]}
        </p>
        <div className="mt-2 flex gap-1.5">
          {STEPS.map((name, i) => (
            <button
              key={name}
              type="button"
              aria-label={`Go to ${name}`}
              aria-current={i === step ? "step" : undefined}
              disabled={i > step}
              onClick={() => i < step && setStep(i)}
              className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-brand" : "bg-border"} ${i < step ? "cursor-pointer" : ""}`}
            />
          ))}
        </div>
      </nav>

      {step === 0 && <YouStep a={answers} set={update} />}
      {step === 1 && <AddressStep a={answers} set={update} token={token} onSlugState={setSlugState} />}
      {step === 2 && <BrandStep a={answers} set={update} token={token} />}
      {step === 3 && <ServicesStep a={answers} set={update} />}
      {step === 4 && <TeamStep a={answers} set={update} />}
      {step === 5 && <PaymentsStep a={answers} set={update} />}
      {last && <ReviewStep a={answers} goTo={setStep} errors={serverErrors} />}

      {problem && (
        <p role="alert" className="mt-6 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          {problem}
        </p>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
        <div className="flex items-center gap-4">
          {step > 0 && (
            <button type="button" onClick={back} className="rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground hover:border-foreground/30">
              Back
            </button>
          )}
          <button type="button" onClick={finishLater} className="text-sm text-muted-foreground underline">
            Save and finish later
          </button>
        </div>
        <div className="flex items-center gap-4">
          <span aria-live="polite" className="text-xs text-muted-foreground">
            {saveState === "saving" ? "Saving…" : saveState === "saved" ? "All changes saved" : saveState === "error" ? "Couldn't save, will retry" : ""}
          </span>
          {last ? (
            <button type="button" onClick={submit} disabled={submitting} className="rounded-xl bg-brand px-6 py-2.5 text-sm font-semibold text-brand-foreground disabled:opacity-60">
              {submitting ? "Sending…" : "Send it in"}
            </button>
          ) : (
            <button type="button" onClick={next} className="rounded-xl bg-brand px-6 py-2.5 text-sm font-semibold text-brand-foreground">
              Continue
            </button>
          )}
        </div>
      </div>
    </Shell>
  );
}

function Shell({ vars, children }: { vars: Record<string, string>; children: React.ReactNode }) {
  return (
    <div data-bare-page className="min-h-screen bg-background" style={vars as React.CSSProperties}>
      <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">{children}</div>
    </div>
  );
}

function Row({ label, children, step, goTo }: { label: string; children: React.ReactNode; step: number; goTo: (s: number) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <div className="mt-1 text-sm text-foreground">{children}</div>
      </div>
      <button type="button" onClick={() => goTo(step)} className="shrink-0 text-sm text-muted-foreground underline">
        Edit
      </button>
    </div>
  );
}

function ReviewStep({ a, goTo, errors }: { a: Answers; goTo: (s: number) => void; errors: string[] }) {
  const days = DAY_ORDER.map((d) => a.hours.days.find((x) => x.day === d)!).filter((d) => d.on);
  return (
    <div>
      <StepHeading title="Does this look right?" lead="Have a quick look. Nothing is final, we'll check it and you can change everything once you're live." />
      {errors.length > 0 && (
        <div role="alert" className="mb-5 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          <p className="font-medium">A few things need fixing first:</p>
          <ul className="mt-1 list-disc pl-5">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="divide-y divide-border rounded-2xl border border-border bg-card px-4">
        <Row label="You" step={0} goTo={goTo}>
          {a.owner.name}, {a.owner.email}
        </Row>
        <Row label="Business" step={0} goTo={goTo}>
          {a.business.name}
          {a.business.area && <span className="block text-muted-foreground">{a.business.area}</span>}
        </Row>
        <Row label="Web address" step={1} goTo={goTo}>
          {a.address.customDomain || `${a.address.slug}.psclean.site`}
        </Row>
        <Row label="Look" step={2} goTo={goTo}>
          <span className="inline-flex items-center gap-2">
            <span className="h-4 w-4 rounded-full border border-border" style={{ backgroundColor: a.brand.color }} />
            {a.brand.color}, {a.brand.headerStyle === "brand" ? "colour top bar" : "light top bar"}, {a.brand.logoUrl ? "logo added" : "no logo yet"}
          </span>
        </Row>
        <Row label="Services" step={3} goTo={goTo}>
          <ul className="space-y-0.5">
            {a.services.map((s) => (
              <li key={s.key}>
                {s.name}
                <span className="text-muted-foreground">
                  {" "}
                  {s.walkthrough ? "free visit" : s.pricing === "hourly" ? `${formatPence(poundsToPence(s.price))} an hour` : s.pricing === "quote" ? `from ${formatPence(poundsToPence(s.price))}, quoted per job` : formatPence(poundsToPence(s.price))}
                </span>
              </li>
            ))}
          </ul>
        </Row>
        <Row label="Team" step={4} goTo={goTo}>
          {[a.team.ownerCleans ? `${a.owner.name} (you)` : null, ...a.team.cleaners.map((c) => c.name)].filter(Boolean).join(", ") || "No one yet"}
          <span className="block text-muted-foreground">{days.map((d) => `${DAY_NAMES[d.day].slice(0, 3)} ${d.start} to ${d.end}`).join(", ")}</span>
        </Row>
        <Row label="Payments" step={5} goTo={goTo}>
          {a.payments.method === "stripe" ? "Connect card payments" : a.payments.method === "later" ? "Not yet" : "Not sure yet"}
        </Row>
      </div>
    </div>
  );
}
