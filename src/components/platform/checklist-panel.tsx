"use client";

import { useState, useTransition } from "react";
import { runChecklistAction, setChecklistItemAction } from "@/lib/actions/platform";
import { CHECKLIST, CHECKLIST_GROUPS, itemOutcome, type ChecklistItem, type ItemState } from "@/lib/checklist-items";

type Outcome = ReturnType<typeof itemOutcome>;

function Mark({ outcome }: { outcome: Outcome }) {
  const base = "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold";
  if (outcome === "done") return <span aria-hidden="true" className={`${base} bg-success text-white`}>✓</span>;
  if (outcome === "left") return <span aria-hidden="true" className={`${base} bg-danger text-white`}>!</span>;
  if (outcome === "unknown") return <span aria-hidden="true" className={`${base} bg-muted text-foreground`}>?</span>;
  return <span aria-hidden="true" className={`${base} border border-border text-muted-foreground`}>·</span>;
}

const OUTCOME_WORD: Record<Outcome, string> = { done: "Done", left: "To do", unknown: "Couldn't check", unchecked: "Not checked yet" };

export function ChecklistPanel({ initial, ready }: { initial: Record<string, ItemState>; ready: boolean }) {
  const [state, setState] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [checking, startChecking] = useTransition();
  const [, startTicking] = useTransition();

  const lastChecked = Object.values(state)
    .map((s) => s.checked_at)
    .filter((t): t is string => Boolean(t))
    .sort()
    .at(-1);

  function check() {
    setError(null);
    startChecking(async () => {
      try {
        const { results, checkedAt } = await runChecklistAction();
        setState((prev) => {
          const next = { ...prev };
          for (const [key, r] of Object.entries(results)) {
            next[key] = { done: prev[key]?.done ?? false, status: r.status, detail: r.detail, checked_at: checkedAt };
          }
          return next;
        });
      } catch {
        setError("The check couldn't run. Try again in a moment.");
      }
    });
  }

  function tick(item: ChecklistItem, done: boolean) {
    setError(null);
    setState((prev) => ({
      ...prev,
      [item.key]: { done, status: prev[item.key]?.status ?? null, detail: prev[item.key]?.detail ?? null, checked_at: prev[item.key]?.checked_at ?? null },
    }));
    startTicking(async () => {
      const result = await setChecklistItemAction(item.key, done);
      if (!result.ok) {
        setError(result.error ?? "Couldn't save that tick.");
        setState((prev) => ({ ...prev, [item.key]: { ...prev[item.key], done: !done } }));
      }
    });
  }

  const outcomes = CHECKLIST.map((item) => ({ item, outcome: itemOutcome(item, state[item.key]) }));
  const done = outcomes.filter((o) => o.outcome === "done").length;
  const left = outcomes.filter((o) => o.outcome === "left");
  const unknown = outcomes.filter((o) => o.outcome === "unknown");
  const unchecked = outcomes.filter((o) => o.outcome === "unchecked").length;
  const pct = Math.round((done / CHECKLIST.length) * 100);

  return (
    <div>
      {!ready && (
        <p role="alert" className="mb-4 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          The checklist table isn&apos;t in the database yet, so ticks can&apos;t be saved. Run migration 0050 in the Supabase SQL editor.
        </p>
      )}

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">
              {done} of {CHECKLIST.length} done
              {left.length > 0 && <span className="font-normal text-muted-foreground">, {left.length} left to do</span>}
              {unknown.length > 0 && <span className="font-normal text-muted-foreground">, {unknown.length} couldn&apos;t be checked</span>}
              {unchecked > 0 && <span className="font-normal text-muted-foreground">, {unchecked} not checked yet</span>}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {lastChecked ? `Last checked ${new Date(lastChecked).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}.` : "Press the button to check everything the site can check for itself."}
            </p>
          </div>
          <button type="button" onClick={check} disabled={checking} className="rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-brand-foreground disabled:opacity-60">
            {checking ? "Checking…" : "Check what's left"}
          </button>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Checklist progress">
          <div className="h-full rounded-full bg-success transition-all" style={{ width: `${pct}%` }} />
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
      </div>

      {left.length > 0 && (
        <section className="mt-5 rounded-xl border border-danger/30 bg-danger/5 p-4" aria-label="Left to do">
          <h2 className="text-sm font-semibold text-danger">Left to do ({left.length})</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground">
            {left.map(({ item }) => (
              <li key={item.key}>{item.title}</li>
            ))}
          </ul>
        </section>
      )}

      {CHECKLIST_GROUPS.map((group) => (
        <section key={group} className="mt-6">
          <h2 className="text-base font-semibold text-foreground">{group}</h2>
          <ul className="mt-2 divide-y divide-border rounded-xl border border-border bg-card">
            {outcomes
              .filter(({ item }) => item.group === group)
              .map(({ item, outcome }) => {
                const s = state[item.key];
                return (
                  <li key={item.key} className="flex items-start gap-3 px-4 py-3">
                    {item.kind === "manual" ? (
                      <input
                        id={`item-${item.key}`}
                        type="checkbox"
                        checked={Boolean(s?.done)}
                        onChange={(e) => tick(item, e.target.checked)}
                        className="mt-1 h-5 w-5 shrink-0 accent-[var(--brand)]"
                      />
                    ) : (
                      <Mark outcome={outcome} />
                    )}
                    <div className="min-w-0 flex-1">
                      <label htmlFor={item.kind === "manual" ? `item-${item.key}` : undefined} className="block text-sm font-medium text-foreground">
                        {item.title}
                      </label>
                      {outcome !== "done" && <p className="mt-0.5 text-sm text-muted-foreground">{item.todo}</p>}
                      {item.kind === "auto" && s?.detail && (
                        <p className={`mt-0.5 text-xs ${outcome === "left" ? "text-danger" : "text-muted-foreground"}`}>{s.detail}</p>
                      )}
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">{item.kind === "manual" ? "By hand" : OUTCOME_WORD[outcome]}</span>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </div>
  );
}
