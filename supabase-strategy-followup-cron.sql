-- Schedules the follow-up job every 15 minutes. Requires a Vault secret named
-- followup_cron_secret that matches the CRON_SECRET function secret
-- (create with: select vault.create_secret('<value>', 'followup_cron_secret');).
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'send-strategy-followups';
SELECT cron.schedule('send-strategy-followups', '*/15 * * * *', $job$
  SELECT net.http_post(
    url := 'https://pmjwwktwlsqpetwfvolb.supabase.co/functions/v1/send-strategy-followups',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'followup_cron_secret')),
    body := '{}'::jsonb);
$job$);
