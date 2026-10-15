import Link from "next/link";
import { FEATURED_DEFAULT_MESSAGE, customerMinutes, formatDuration, servicePriceLabel } from "@/lib/format";
import type { Service } from "@/lib/types";

// Service cards in two columns. A featured service becomes a wide button across
// both columns, above the rest, with the owner's own message.
export function ServiceList({ services }: { services: Service[] }) {
  const featured = services.filter((s) => s.is_featured);
  const rest = services.filter((s) => !s.is_featured);

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
      {rest.map((s) => (
        <Link
          key={s.id}
          href={`/book/${s.id}`}
          className="rounded-xl border border-border bg-card p-5 transition hover:border-brand"
        >
          <h3 className="font-semibold text-foreground">{s.name}</h3>
          {s.description && <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>}
          <div className="mt-3 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{formatDuration(customerMinutes(s))}</span>
            <span className="font-semibold text-brand">{servicePriceLabel(s)}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}
