-- Square 512x512 PNG derived from logo_url in the browser at upload time, so
-- rectangular logos still make a sensible favicon / PWA icon. The header
-- keeps using logo_url as uploaded.
alter table "PS_CLEAN_businesses" add column if not exists icon_url text;
