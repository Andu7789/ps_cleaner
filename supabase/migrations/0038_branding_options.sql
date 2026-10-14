-- Owner branding beyond the single brand colour: how strongly the page is
-- tinted, whether the header bar is brand coloured, and an optional faded
-- logo watermark behind the pages.
alter table "PS_CLEAN_businesses"
  add column if not exists background_style text not null default 'neutral'
    check (background_style in ('neutral', 'tinted')),
  add column if not exists header_style text not null default 'light'
    check (header_style in ('light', 'brand')),
  add column if not exists logo_watermark boolean not null default false,
  add column if not exists watermark_opacity integer not null default 8
    check (watermark_opacity between 2 and 30),
  add column if not exists watermark_position text not null default 'center'
    check (watermark_position in ('center', 'top-right', 'bottom-right', 'tiled')),
  add column if not exists watermark_size integer not null default 60
    check (watermark_size between 20 and 100);
