-- 週間レポートの定期実行（Phase 2 で実行）。マイグレーションではなく、SQL Editor で手動実行する。
-- 事前: Dashboard > Database > Extensions で pg_cron と pg_net を有効化。
-- <PROJECT_REF> と <SERVICE_ROLE_KEY> を自分の値に置き換える。service_role キーは Git に絶対コミットしない。

-- 1) service_role キーを Vault に保存（1回だけ）
select vault.create_secret('<SERVICE_ROLE_KEY>', 'service_role_key');

-- 2) 毎時0分に send-weekly-report を呼ぶ（pg_cron は UTC 基準。毎時なので JST でも毎時0分になる）
--    関数側で「いまが設定の曜日・時刻（JST）か」を判定して、該当する人だけに送る。
select cron.schedule(
  'weekly-report-hourly',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-weekly-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{"mode":"cron"}'::jsonb
  );
  $$
);

-- 停止したいとき:  select cron.unschedule('weekly-report-hourly');
-- 実行履歴の確認:  select * from cron.job_run_details order by start_time desc limit 10;
