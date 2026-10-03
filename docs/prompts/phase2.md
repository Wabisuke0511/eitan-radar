# Phase 2 プロンプト（AI分析 + 週間レポート）

事前：Phase 1 の実機確認が完了。`docs/setup.md` の「Phase 2 の準備」（API キー・Resend・シークレット・関数デプロイ・cron）を人間側で実施。Claude Code にはキーを貼らない（`supabase secrets set` は私が実行する）。

```
Phase 1 の実機確認が終わりました。Phase 2 に進みます。CLAUDE.md と docs/spec.md の「5. AI分析」「6. 週間レポート」を読み直してください。

【ゴール】弱点タブのAI分析と、週間レポート（メール）＋「今すぐ送信」を本番で動かす。

【やること】
1. FEATURES.ai と FEATURES.report を true にし、モックの aiCard() / 週間レポート画面（openReport 系）を本番化する。
   - AI分析：モックの buildSummary(lv) を使い、supabase.functions.invoke('ai-analysis', { body:{ child_id, summary } })。levels に status（クリア済み/挑戦中/未解放）を含める。エラーコード（rate_limited など）は日本語の短い案内に。モックの SAMPLE / claude.use('sample') は削除
   - 週間レポート画面：設定（メールのON/OFF・送信先・曜日・時刻・毎週おくる）は report_settings に保存（update できる列は enabled, email, email_enabled, line_enabled, dow, hour のみ。line_user_id は触れない）。プレビューの数値は rpc('weekly_summary', { p_child, p_end:今日(JST), p_tz:'Asia/Tokyo' }) と rpc('weak_overview') から作り、モックと同じ見た目にする。学習時間・日ごとの問題数も同じ RPC から
   - 「今すぐ送信」：supabase.functions.invoke('send-weekly-report', { body:{ child_id } })。成功/失敗を画面に出し、「最近の送信」は report_logs から（新しい順に5件）
   - LINE の項目は FEATURES.line が false の間は非表示
   - プレビューのAIコメント：send-weekly-report と同じプロンプトを使う小さな Edge Function（weekly-comment）を追加するか、プレビューでは「コメントは送信時に付きます」と表示するかを A/B で私に聞く
2. supabase/functions 配下を確認し、型エラー・Deno で動かない記述（node: の import など）があれば直す。私が `npx supabase functions deploy` で再デプロイできる状態にしてからコマンドを提示する（PowerShell・1行）。
3. 動作確認を自分で行って報告する：
   - ai-analysis：テスト用 JWT でサンプル summary を送り JSON が返る
   - send-weekly-report（manual）：自分宛てに送り、report_logs に sent が入る。1日3回の上限が効く
   - send-weekly-report（cron）：曜日・時刻が一致しない設定では送られない／一致して6日以内に送信済みなら送られない（ローカルでロジックを確認）
4. sw.js の CACHE_VERSION を 'eitan-v2' に上げる。git commit（feat: phase2 ai analysis and weekly report）。CLAUDE.md の決定事項ログを更新。

【やらないこと】LINE の実装、スキーマ変更（必要なら新しいマイグレーションを提案）、デザイン変更。

【最後に報告】①変えたこと ②私が実機で確認する項目（spec.md 11 の Phase 2） ③私がやる手作業（Secrets・cron・Resend など。未実施のものだけ）
```
