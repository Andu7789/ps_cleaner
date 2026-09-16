// Same pattern used elsewhere in this workspace (Root Cafe App's
// SitePicker): a query-embed iframe needs no API key and is good enough
// for "here's roughly where this is," and a plain Google Maps directions
// deep link hands off to whichever maps app the cleaner's own device
// opens it in (Google Maps on Android/desktop, prompts for Apple Maps on
// iOS) for live turn-by-turn navigation from wherever they actually are —
// no geolocation call or platform detection needed on our side, no SDK,
// no billing account.
export function JobMap({ address }: { address: string }) {
  const query = encodeURIComponent(address);

  return (
    <div className="mt-3">
      <iframe
        src={`https://www.google.com/maps?q=${query}&output=embed`}
        title={`Map showing ${address}`}
        loading="lazy"
        className="h-36 w-full rounded-lg border-0"
      />
      <a
        href={`https://www.google.com/maps/dir/?api=1&destination=${query}`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-block rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-brand hover:border-brand"
      >
        Get directions
      </a>
    </div>
  );
}
