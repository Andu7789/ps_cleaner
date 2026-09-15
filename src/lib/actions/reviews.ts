"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { CleanerRating } from "@/lib/types";

export async function createReviewAction(bookingId: string, rating: number, comment?: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("ps_clean_create_review", {
    p_booking_id: bookingId,
    p_rating: rating,
    p_comment: comment || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/account/bookings/${bookingId}`);
}

export async function getCleanerRatingsAction(cleanerIds: string[]): Promise<Record<string, CleanerRating>> {
  if (cleanerIds.length === 0) return {};
  const supabase = await createClient();
  const results = await Promise.all(
    cleanerIds.map(async (id) => {
      const { data } = await supabase.rpc("ps_clean_cleaner_rating", { p_cleaner_id: id }).maybeSingle();
      return [id, (data as CleanerRating | null) ?? { average_rating: null, review_count: 0 }] as const;
    })
  );
  return Object.fromEntries(results);
}
