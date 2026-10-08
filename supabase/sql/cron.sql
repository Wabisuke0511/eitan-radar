-- 週間レポートの定期実行。マイグレーションではなく、SQL Editor で手動実行する（2026-10-08 に実施済み、jobid=1）。
-- 事前: Dashboard > Database > Extensions で pg_cron と pg_net を有効化。
-- <SERVICE_ROLE_KEY> を自分の値に置き換える。service_role キーは Git に絶対コミットしない。実行後、snippet は保存しない。
-- ※ Supabase は bpulse-check と共用のため、Vault の名前とジョブ名に eitan を付けて衝突を避ける。

-- 1) service_role キーを Vault に保存（1回だけ）
select vault.create_secret('<SERVICE_ROLE_KEY>', 'eitan_service_role_key');

-- 2) 毎時0分に send-weekly-report を呼ぶ（pg_cron は UTC 基準。毎時なので JST でも毎時0分になる）
--    関数側で「いまが設定の曜日・時刻（JST）か」を判定して、該当する人だけに送る。
select cron.schedule(
  'eitan-weekly-report-hourly',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://otorkvmcnhwspjwypurb.supabase.co/functions/v1/send-weekly-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'eitan_service_role_key')
    ),
    body := '{"mode":"cron"}'::jsonb
  );
  $$
);

-- 停止したいとき:  select cron.unschedule('eitan-weekly-report-hourly');
-- 実行履歴の確認:
--   select start_time, status, return_message from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'eitan-weekly-report-hourly')
--   order by start_time desc limit 5;
