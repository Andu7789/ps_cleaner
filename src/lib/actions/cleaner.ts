"use server";

import { revalidatePath } from "next/cache";
import { requireCleaner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { PhotoKind } from "@/lib/types";

const PHOTO_BUCKET = "ps-clean-booking-photos";

export async function completeBookingAction(bookingId: string) {
  await requireCleaner();
  const supabase = await createClient();
  const { error } = await supabase.rpc("ps_clean_cleaner_complete_booking", { p_booking_id: bookingId });
  if (error) throw new Error(error.message);
  revalidatePath("/cleaner");
  revalidatePath(`/cleaner/bookings/${bookingId}`);
}

export async function uploadBookingPhotoAction(bookingId: string, kind: PhotoKind, file: File) {
  const { cleaner } = await requireCleaner();
  if (!file || file.size === 0) throw new Error("Choose a photo first");
  if (!file.type.startsWith("image/")) throw new Error("Only image files are supported");

  const supabase = await createClient();
  const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${bookingId}/${kind}-${Date.now()}.${ext}`;

  // RLS on storage.objects (see migration 0020) re-checks that this booking
  // is actually this cleaner's before the upload is allowed to land, so
  // this isn't the only line of defence even though we also scope the path.
  const { error: uploadError } = await supabase.storage.from(PHOTO_BUCKET).upload(path, file, {
    contentType: file.type,
  });
  if (uploadError) throw new Error(uploadError.message);

  const { error } = await supabase.from("PS_CLEAN_booking_photos").insert({
    booking_id: bookingId,
    kind,
    storage_path: path,
    uploaded_by_cleaner_id: cleaner.id,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/cleaner/bookings/${bookingId}`);
}

export async function deleteBookingPhotoAction(photoId: string) {
  await requireCleaner();
  const supabase = await createClient();
  const { data: photo } = await supabase
    .from("PS_CLEAN_booking_photos")
    .select("*")
    .eq("id", photoId)
    .maybeSingle();
  if (!photo) return;

  await supabase.storage.from(PHOTO_BUCKET).remove([photo.storage_path]);
  await supabase.from("PS_CLEAN_booking_photos").delete().eq("id", photoId);
  revalidatePath(`/cleaner/bookings/${photo.booking_id}`);
}
