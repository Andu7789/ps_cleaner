-- Owner chosen page background colour (overrides the neutral/tinted style when
-- set), and a per service "featured" flag that turns the service into a wide
-- stand out button across the service list, with its own message.
alter table "PS_CLEAN_businesses"
  add column if not exists background_color text
    check (background_color is null or background_color ~ '^#[0-9a-fA-F]{6}$');

alter table "PS_CLEAN_services"
  add column if not exists is_featured boolean not null default false,
  add column if not exists featured_message text;
