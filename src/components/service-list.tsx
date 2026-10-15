import Link from "next/link";
import {
  FEATURED_DEFAULT_MESSAGE,
  WALKTHROUGH_FIRST_CTA,
  WALKTHROUGH_FIRST_NOTE,
  customerMinutes,
  findWalkthroughService,
  formatDuration,
  servicePriceLabel,
} from "@/lib/format";
import type { Service } from "@/lib/types";

// Service cards in two columns. A featured service becomes a wide button across
// both columns, above the rest, with the owner's own message. A "walkthrough
// first" service is shown with its from price and a note, and its button goes
// to the walkthrough instead of a booking page.
export function ServiceList({ services }: { services: Service[] }) {
  const featured = services.filter((s) => s.is_featured && !s.walkthrough_first);
  const rest = services.filter((s) => !featured.includes(s));
  const walkthrough = findWalkthroughService(services);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {featured.map((s) => (
        <Link
          key={s.id}
          href={`/book/${s.id}`}
          className="featured-cta flex flex-col items-center gap-1 rounded-xl bg-brand px-6 py-6 text-center text-brand-foreground shadow-md ring-4 ring-brand/20 transition hover:brightness-110 sm:col-span-2"
        >
          <span className="text-xl font-semibold sm:text-2xl">{s.featured_message?.trim() || FEATURED_DEFAULT_MESSAGE}</span>
          <span className="text-sm opacity-90">
            {s.name} · {formatDuration(customerMinutes(s))} · {servicePriceLabel(s)}
          </span>
        </Link>
      ))}
      {rest.map((s) => {
        const body = (
          <>
            <h3 className="font-semibold text-foreground">{s.name}</h3>
            {s.description && <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>}
            {s.walkthrough_first && <p className="mt-2 text-sm font-medium text-foreground">{WALKTHROUGH_FIRST_NOTE}</p>}
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{s.walkthrough_first ? "" : formatDuration(customerMinutes(s))}</span>
              <span className="font-semibold text-brand">{servicePriceLabel(s)}</span>
            </div>
            {s.walkthrough_first && walkthrough && (
              <p className="mt-3 text-sm font-semibold text-brand">{WALKTHROUGH_FIRST_CTA} &rarr;</p>
            )}
          </>
        );
        const cardClass = "rounded-xl border border-border bg-card p-5";
        if (s.walkthrough_first && !walkthrough) {
          return (
            <div key={s.id} className={cardClass}>
              {body}
            </div>
          );
        }
        return (
          <Link
            key={s.id}
            href={`/book/${s.walkthrough_first && walkthrough ? walkthrough.id : s.id}`}
            className={`${cardClass} transition hover:border-brand`}
          >
            {body}
          </Link>
        );
      })}
    </div>
  );
}
