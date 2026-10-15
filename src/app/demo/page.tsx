import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Building,
  Check,
  ClipboardCheck,
  Footprints,
  HeartHandshake,
  House,
  KeyRound,
  Lock,
  Plus,
  ShieldCheck,
  Sparkles,
  SprayCan,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business";
import { DEMO_COPY as copy } from "@/lib/demo-content";
import { customerMinutes, formatDuration, servicePriceLabel } from "@/lib/format";
import { QuickBook } from "@/components/demo/quick-book";
import { Reveal } from "@/components/demo/reveal";
import type { Service } from "@/lib/types";

export const metadata: Metadata = { title: "New look preview" };

const GOLD = "#e8c47c";
const TRUST_ICONS: LucideIcon[] = [ShieldCheck, BadgeCheck, HeartHandshake, Lock];

// Picks an icon from the service name so new services still get a sensible one.
function serviceIcon(name: string): LucideIcon {
  const n = name.toLowerCase();
  if (n.includes("walk")) return Footprints;
  if (n.includes("deep")) return SprayCan;
  if (n.includes("tenan") || n.includes("move")) return KeyRound;
  if (n.includes("commercial") || n.includes("office")) return Building;
  if (n.includes("standard") || n.includes("regular")) return House;
  return Sparkles;
}

const display = "[font-family:var(--font-demo-display)]";
// Staggered rise on first load only. Honours reduced motion (see globals.css).
const rise = (i: number) => ({ animationDelay: `${i * 80}ms` });

export default async function DemoHomePage() {
  const business = await getCurrentBusiness();
  const supabase = await createClient();
  const { data } = await supabase
    .from("PS_CLEAN_services")
    .select("*")
    .eq("business_id", business.id)
    .eq("is_active", true)
    .order("price_pence", { ascending: true });
  const services = (data ?? []) as Service[];
  const featured = services.find((s) => s.is_featured);
  const others = services.filter((s) => !s.is_featured);
  // The featured service leads the quick book chips and the main button.
  const ordered = featured ? [featured, ...others] : services;
  const primaryHref = featured ? `/book/${featured.id}` : "/book";
  const primaryLabel = featured?.featured_message?.trim() || (featured ? "New here? Book a walkthrough" : "Book a clean");

  return (
    <div className="bg-white text-[#1a1116]">
      {/* Hero: the brand colour carries the whole fold */}
      <section className="relative overflow-hidden bg-[var(--brand)] text-[var(--brand-foreground)]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-40 -top-40 size-[34rem] rounded-full opacity-[0.12]"
          style={{ background: `radial-gradient(circle, ${GOLD}, transparent 65%)` }}
        />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-5 pb-20 pt-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-14 lg:pb-28 lg:pt-16">
          <div>
            <p className="demo-rise text-sm font-medium" style={{ ...rise(0), color: GOLD }}>
              {business.business_name}
            </p>
            <h1
              className={`demo-rise mt-3 text-balance text-[clamp(2.4rem,5.2vw,4.4rem)] font-semibold leading-[1.04] tracking-[-0.02em] ${display}`}
              style={rise(1)}
            >
              {copy.hero.headline}
            </h1>
            <p className="demo-rise mt-5 max-w-xl text-pretty text-lg leading-relaxed opacity-90" style={rise(2)}>
              {copy.hero.sub}
            </p>
            <div className="demo-rise mt-8 flex flex-wrap items-center gap-3" style={rise(3)}>
              <Link
                href={primaryHref}
                className="inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-base font-semibold text-[#2a1018] transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                style={{ backgroundColor: GOLD }}
              >
                {primaryLabel}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <a
                href="#services"
                className="rounded-full border border-white/40 px-6 py-3.5 text-base font-medium transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                {copy.hero.secondaryCta}
              </a>
            </div>
          </div>

          <div className="demo-rise relative mx-auto w-full max-w-md lg:max-w-none" style={rise(2)}>
            {/* eslint-disable-next-line @next/next/no-img-element -- local static photo, image optimiser unavailable on this host */}
            <img
              src="/demo/living.jpg"
              alt={copy.hero.imageAlt}
              width={1000}
              height={1500}
              className="aspect-[4/5] w-full rounded-[2rem] object-cover lg:ml-auto lg:max-w-sm"
              fetchPriority="high"
            />
            <div className="relative z-10 -mt-16 px-3 lg:-mt-24 lg:-ml-10 lg:mr-auto lg:max-w-sm lg:px-0">
              <QuickBook
                services={ordered.map((s) => ({
                  id: s.id,
                  name: s.name,
                  priceLabel: servicePriceLabel(s),
                  duration: formatDuration(customerMinutes(s)),
                }))}
                title={copy.quickBook.title}
                hint={copy.quickBook.hint}
                cta={copy.quickBook.cta}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Trust */}
      <section aria-label="Why customers trust us" className="border-b border-[#efe7ea]">
        <ul className="mx-auto grid max-w-6xl gap-6 px-5 py-10 sm:grid-cols-2 lg:grid-cols-4">
          {copy.trust.map((t, i) => {
            const Icon = TRUST_ICONS[i % TRUST_ICONS.length];
            return (
              <li key={t.title} className="flex gap-3">
                <Icon className="mt-0.5 size-6 shrink-0 text-[var(--brand)]" aria-hidden="true" />
                <div>
                  <p className={`font-semibold ${display}`}>{t.title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-[#5d5258]">{t.text}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Services */}
      <section id="services" className="scroll-mt-20 px-5 py-20 lg:py-28">
        <div className="mx-auto max-w-6xl">
          <h2 className={`max-w-2xl text-balance text-[clamp(2rem,3.6vw,3rem)] font-semibold leading-tight tracking-[-0.015em] ${display}`}>
            {copy.services.heading}
          </h2>
          <p className="mt-3 max-w-xl text-lg text-[#5d5258]">{copy.services.sub}</p>

          <div className="mt-10 grid grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-5">
            {featured && (
              <Reveal variant="fade-up" className="col-span-full">
              <Link
                href={`/book/${featured.id}`}
                className="group relative grid overflow-hidden rounded-3xl bg-[var(--brand)] text-[var(--brand-foreground)] transition-transform hover:-translate-y-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--brand)] sm:grid-cols-[1.2fr_1fr]"
              >
                <div className="p-7 sm:p-10">
                  <p className="text-sm font-medium" style={{ color: GOLD }}>
                    {copy.services.featuredLead}
                  </p>
                  <h3 className={`mt-2 text-balance text-3xl font-semibold leading-tight sm:text-4xl ${display}`}>
                    {featured.featured_message?.trim() || "New here? Book a walkthrough"}
                  </h3>
                  {featured.description && <p className="mt-3 max-w-md opacity-90">{featured.description}</p>}
                  <p className="mt-5 flex items-center gap-3 text-sm opacity-90">
                    <span>{featured.name}</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatDuration(customerMinutes(featured))}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-semibold">{servicePriceLabel(featured)}</span>
                  </p>
                  <span
                    className="mt-6 inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-[#2a1018]"
                    style={{ backgroundColor: GOLD }}
                  >
                    {copy.services.cardCta}
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                  </span>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element -- local static photo */}
                <img
                  src="/demo/stairs.jpg"
                  alt=""
                  width={1000}
                  height={667}
                  loading="lazy"
                  className="hidden h-full min-h-64 w-full object-cover sm:block"
                />
              </Link>
              </Reveal>
            )}

            {others.map((s, i) => {
              const Icon = serviceIcon(s.name);
              // Same rhythm as the MessageHome cards: zoom, fade up, zoom, staggered by column.
              return (
                <Reveal key={s.id} variant={i % 3 === 1 ? "fade-up" : "zoom-in"} delay={((i % 3) + 1) * 100}>
                  <Link
                    href={`/book/${s.id}`}
                    className="group relative flex h-full flex-col overflow-hidden rounded-[20px] border border-[#e9dfe3] bg-white px-7 py-8 transition duration-300 hover:-translate-y-2 hover:shadow-[0_20px_50px_-20px_rgba(26,17,22,0.35)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--brand)]"
                  >
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-0 top-0 h-1 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                      style={{ background: `linear-gradient(90deg, var(--brand), ${GOLD})` }}
                    />
                    <div className="flex items-center gap-3">
                      <span className="flex size-[45px] items-center justify-center rounded-[10px] bg-[color-mix(in_srgb,var(--brand)_10%,white)] text-[var(--brand)]">
                        <Icon className="size-5" aria-hidden="true" />
                      </span>
                      <span className="rounded-full bg-[color-mix(in_srgb,var(--brand)_8%,white)] px-3 py-1 text-xs font-semibold text-[var(--brand)]">
                        {formatDuration(customerMinutes(s))}
                      </span>
                    </div>
                    <h3 className={`mt-5 text-xl font-semibold ${display}`}>{s.name}</h3>
                    {s.description && <p className="mt-2 flex-1 text-sm leading-relaxed text-[#5d5258]">{s.description}</p>}
                    <div className="mt-6 flex items-center justify-between gap-3 border-t border-[#efe7ea] pt-4">
                      <p className={`text-xl font-semibold text-[var(--brand)] ${display}`}>{servicePriceLabel(s)}</p>
                      <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm font-semibold text-[var(--brand)]">
                        {copy.services.cardCta}
                        <ArrowRight className="size-4 transition-transform group-hover:translate-x-1.5" aria-hidden="true" />
                      </span>
                    </div>
                  </Link>
                </Reveal>
              );
            })}
            {services.length === 0 && <p className="text-[#5d5258]">Services will appear here once they are set up.</p>}
          </div>
        </div>
      </section>

      {/* How it works: a real sequence, so numbered */}
      <section className="bg-[color-mix(in_srgb,var(--brand)_6%,white)] px-5 py-20 lg:py-28">
        <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- local static photo */}
          <img
            src="/demo/gloves.jpg"
            alt={copy.how.imageAlt}
            width={1000}
            height={563}
            loading="lazy"
            className="aspect-[4/3] w-full rounded-[2rem] object-cover"
          />
          <div>
            <h2 className={`text-balance text-[clamp(2rem,3.6vw,3rem)] font-semibold leading-tight tracking-[-0.015em] ${display}`}>
              {copy.how.heading}
            </h2>
            <ol className="mt-8 space-y-6">
              {copy.how.steps.map((step, i) => (
                <li key={step.title} className="flex gap-4">
                  <span
                    className={`flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] text-base font-semibold text-[var(--brand-foreground)] ${display}`}
                  >
                    {i + 1}
                  </span>
                  <div>
                    <h3 className={`text-xl font-semibold ${display}`}>{step.title}</h3>
                    <p className="mt-1 max-w-md leading-relaxed text-[#5d5258]">{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* The standard */}
      <section className="px-5 py-20 lg:py-28">
        <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <h2 className={`text-balance text-[clamp(2rem,3.6vw,3rem)] font-semibold leading-tight tracking-[-0.015em] ${display}`}>
              {copy.standard.heading}
            </h2>
            <p className="mt-3 max-w-xl text-lg text-[#5d5258]">{copy.standard.sub}</p>
            <ul className="mt-8 space-y-4">
              {copy.standard.points.map((p) => (
                <li key={p} className="flex gap-3">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] text-[var(--brand-foreground)]">
                    <Check className="size-3.5" aria-hidden="true" />
                  </span>
                  <span className="leading-relaxed">{p}</span>
                </li>
              ))}
            </ul>
            <Link
              href={primaryHref}
              className="mt-9 inline-flex items-center gap-2 rounded-full bg-[var(--brand)] px-6 py-3.5 font-semibold text-[var(--brand-foreground)] transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]"
            >
              {primaryLabel}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element -- local static photo */}
          <img
            src="/demo/vacuum.jpg"
            alt={copy.standard.imageAlt}
            width={1200}
            height={675}
            loading="lazy"
            className="aspect-[5/4] w-full rounded-[2rem] object-cover"
          />
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-[color-mix(in_srgb,var(--brand)_6%,white)] px-5 py-20 lg:py-28">
        <div className="mx-auto max-w-3xl">
          <h2 className={`text-balance text-[clamp(2rem,3.6vw,3rem)] font-semibold leading-tight tracking-[-0.015em] ${display}`}>
            {copy.faq.heading}
          </h2>
          <div className="mt-8 divide-y divide-[#e4d8dd] border-y border-[#e4d8dd]">
            {copy.faq.items.map((item) => (
              <details key={item.q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--brand)] [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <Plus className="size-5 shrink-0 text-[var(--brand)] transition-transform group-open:rotate-45" aria-hidden="true" />
                </summary>
                <p className="mt-3 max-w-2xl leading-relaxed text-[#5d5258]">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Closing call to action */}
      <section className="bg-[var(--brand)] px-5 py-20 text-center text-[var(--brand-foreground)] lg:py-24">
        <div className="mx-auto max-w-2xl">
          <ClipboardCheck className="mx-auto size-8" style={{ color: GOLD }} aria-hidden="true" />
          <h2 className={`mt-4 text-balance text-[clamp(2rem,4vw,3.2rem)] font-semibold leading-tight tracking-[-0.015em] ${display}`}>
            {copy.closing.heading}
          </h2>
          <p className="mt-3 text-lg opacity-90">{copy.closing.sub}</p>
          <Link
            href={primaryHref}
            className="mt-8 inline-flex items-center gap-2 rounded-full px-7 py-4 text-base font-semibold text-[#2a1018] transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            style={{ backgroundColor: GOLD }}
          >
            {primaryLabel}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </section>
    </div>
  );
}
