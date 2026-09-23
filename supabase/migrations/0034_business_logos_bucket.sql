-- Public bucket for per-business logos. Logos are shown on the public site
-- (header, favicon, PWA manifest), so reads are public. There are no
-- insert/update/delete policies on purpose: uploads go through
-- uploadBusinessLogoAction, which checks requireOwner() and then writes with
-- the service role.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ps_clean_business_logos',
  'ps_clean_business_logos',
  true,
  1048576,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do nothing;
