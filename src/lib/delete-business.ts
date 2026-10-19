import type { SupabaseClient } from "@supabase/supabase-js";

// The parts of deleting a business that live outside the database. The rows
// themselves go in one transaction (ps_clean_delete_business, migration
// 0049), which hands back what is left to tidy: sign in accounts, Stripe and
// stored files. Each of these is best effort, because the business is already
// gone by then, so a failure becomes a warning rather than an error.

export const LOGO_BUCKET = "ps_clean_business_logos";
export const PHOTO_BUCKET = "ps-clean-booking-photos";

export interface DeleteSummary {
  slug: string;
  bookings: number;
  customers: number;
  cleaners: number;
  services: number;
  payments: number;
  orphan_user_ids: string[];
  stripe_customer_ids: string[];
  stripe_account_id: string | null;
  photo_paths: string[];
}

// Removes every file under a folder, going down into subfolders.
export async function removeFolder(db: SupabaseClient, bucket: string, prefix: string, depth = 0): Promise<number> {
  if (depth > 4) return 0;
  const store = db.storage.from(bucket);
  const { data } = await store.list(prefix, { limit: 1000 });
  if (!data) return 0;
  let removed = 0;
  const files: string[] = [];
  for (const entry of data) {
    // Folders come back without an id.
    if (entry.id) files.push(`${prefix}/${entry.name}`);
    else removed += await removeFolder(db, bucket, `${prefix}/${entry.name}`, depth + 1);
  }
  if (files.length > 0) {
    const { error } = await store.remove(files);
    if (!error) removed += files.length;
  }
  return removed;
}

async function removeFiles(db: SupabaseClient, bucket: string, paths: string[]): Promise<number> {
  let removed = 0;
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await db.storage.from(bucket).remove(paths.slice(i, i + 100));
    if (!error) removed += Math.min(100, paths.length - i);
  }
  return removed;
}

export async function cleanUpAfterDelete(
  db: SupabaseClient,
  businessId: string,
  summary: DeleteSummary,
  extraLogoFolders: string[],
): Promise<string[]> {
  const warnings: string[] = [];

  for (const userId of summary.orphan_user_ids) {
    const { error } = await db.auth.admin.deleteUser(userId);
    if (error) warnings.push(`Couldn't remove a sign in account: ${error.message}`);
  }

  try {
    await removeFolder(db, LOGO_BUCKET, businessId);
    for (const folder of extraLogoFolders) await removeFolder(db, LOGO_BUCKET, folder);
    await removeFiles(db, PHOTO_BUCKET, summary.photo_paths);
  } catch (err) {
    warnings.push(`Some stored files weren't removed: ${err instanceof Error ? err.message : String(err)}`);
  }

  return warnings;
}
