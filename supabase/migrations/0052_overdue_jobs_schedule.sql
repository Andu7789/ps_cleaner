-- Every 5 minutes, asks the site to email the owner about any job still not
-- marked complete 15 minutes after its end time. Vercel's free plan only
-- runs scheduled jobs once a day, which is too coarse for this, so the
-- database does the ticking instead. The key comes from
-- PS_CLEAN_private_settings (migration 0051) and is checked by
-- /api/cron/overdue-jobs.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('ps-clean-overdue-jobs')
where exists (select 1 from cron.job where jobname = 'ps-clean-overdue-jobs');

select cron.schedule(
  'ps-clean-overdue-jobs',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://psclean.site/api/cron/overdue-jobs',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-key', (select value from public."PS_CLEAN_private_settings" where key = 'cron_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);
