// Turns the free (unbooked, in-hours, not-timed-off) ranges returned by the
// ps_clean_available_slots() RPC into concrete, offerable booking start
// times. This is deliberately separate from that RPC: the RPC already
// subtracted every OTHER booking's own buffer-padded range from the working
// hours, but it has no idea what buffer the booking someone is *about* to
// make would need — that's specific to whichever service they're booking.
// So a candidate slot is only valid if room exists in the free range for
// its own buffer on both sides, not just its raw job duration.
//
// This is a courtesy for building a good picker UI — ps_clean_create_booking
// (and the EXCLUDE constraint underneath it) remains the actual source of
// truth and will reject anything that doesn't really fit.

export interface FreeRange {
  free_start: string;
  free_end: string;
}

export interface SlotOptions {
  durationMinutes: number;
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
  stepMinutes?: number;
}

export function candidateStartTimes(ranges: FreeRange[], opts: SlotOptions): Date[] {
  const bufferBefore = opts.bufferBeforeMinutes ?? 0;
  const bufferAfter = opts.bufferAfterMinutes ?? 0;
  const step = (opts.stepMinutes ?? 15) * 60_000;
  const duration = opts.durationMinutes * 60_000;
  const before = bufferBefore * 60_000;
  const after = bufferAfter * 60_000;

  const starts: Date[] = [];

  for (const range of ranges) {
    const rangeStart = new Date(range.free_start).getTime();
    const rangeEnd = new Date(range.free_end).getTime();

    // A candidate booking starting at `jobStart` occupies the padded span
    // [jobStart - before, jobStart + duration + after) — both ends of that
    // span must land inside this free range.
    const earliestStart = rangeStart + before;
    const latestStart = rangeEnd - duration - after;

    for (let jobStart = earliestStart; jobStart <= latestStart; jobStart += step) {
      starts.push(new Date(jobStart));
    }
  }

  return starts;
}
