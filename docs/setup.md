# セットアップ（人間がやる作業）

コマンドは PowerShell 用。`<...>` は自分の値に置き換える。**秘密の値（service_role / API キー）は Git にコミットしない。**

## Phase 0（Phase 1 の前に）

### 0-1. GitHub
1. 新しいリポジトリを作る（例：`eitan-radar`、Public）。
2. このフォルダを入れて push：
```powershell
cd <このフォルダ>; git init; git add .; git commit -m "chore: initial handoff set"; git branch -M main; git remote add origin https://github.com/<ユーザー名>/eitan-radar.git; git push -u origin main
```
3. GitHub の Settings > Pages で、Branch=`main` / フォルダ=`/(root)` を選んで公開。URL は `https://<ユーザー名>.github.io/eitan-radar/`。
4. `.gitignore` に `.env` と `supabase/.temp` を入れておく：
```powershell
Add-Content .gitignore ".env"; Add-Content .gitignore "supabase/.temp"
```

### 0-2. Supabase
1. https://supabase.com で新規プロジェクト（Region は Tokyo `ap-northeast-1` 推奨）。**DB パスワードは控える。**
2. Project Settings > API から **Project URL** と **anon public key** を控える（`service_role` は絶対にコードに書かない）。
3. マイグレーションを流す：
```powershell
npx supabase init; npx supabase login; npx supabase link --project-ref <PROJECT_REF>; npx supabase db push
```
（`init` で `config.toml` が作られる。既存の `supabase/migrations` はそのまま使われる）
4. 語彙サンプルを入れる：Dashboard > SQL Editor に `supabase/seed/vocab_seed.sql` の中身を貼って実行。
5. 確認：Table Editor で `vocab_items` が101行、`children` など全テーブルに RLS が「Enabled」になっていること。

### 0-3. 認証（メールOTP）
1. Authentication > Providers で **Email** を有効にする。
2. Authentication > Email Templates の **「Confirm signup」と「Magic Link」の両方**に、6桁コードを表示する文言を入れる（例：`ログインコード：{{ .Token }}`）。リンクの文言は消してよい。
3. Authentication > URL Configuration の **Site URL** に、GitHub Pages の URL を入れる。
4. Supabase 標準のメール送信は回数制限が厳しい。ログインコードが届かない・止まる場合は、Authentication の SMTP 設定で Resend の SMTP（Phase 2 で作るアカウント）を設定する。

## Phase 2（AI分析 + 週間レポート）の準備
1. **Anthropic API キー**：https://console.anthropic.com で作成（`sk-ant-...`）。利用上限（月額）を低めに設定しておく。
2. **Resend**：アカウント作成 → Domains で**自分のドメインを追加し DNS（SPF/DKIM）を設定して Verified にする** → API Keys で作成（`re_...`）。※無料プランは月3,000通・1日100通。
3. シークレット登録（`REPORT_FROM` は認証済みドメインのアドレス）：
```powershell
npx supabase secrets set ANTHROPIC_API_KEY=<sk-ant-...> RESEND_API_KEY=<re_...> REPORT_FROM="えいたんレーダー <report@<あなたのドメイン>>"
```
4. 関数をデプロイ：
```powershell
npx supabase functions deploy ai-analysis; npx supabase functions deploy send-weekly-report
```
5. 定期実行：Dashboard > Database > Extensions で **pg_cron** と **pg_net** を有効化 → `supabase/sql/cron.sql` の `<PROJECT_REF>` と `<SERVICE_ROLE_KEY>` を置き換えて SQL Editor で実行。**置き換えたファイルは保存・コミットしない。**

## Phase 3（LINE）の準備
1. LINE Official Account Manager で公式アカウントを作成（無料の「コミュニケーションプラン」で開始。月200通まで）。
2. 設定 > Messaging API > 「Messaging API を利用する」→ プロバイダーを作成。
3. LINE Developers コンソールのチャネルで、**Channel secret**（Basic settings）と **Channel access token（長期）**（Messaging API タブ）を控える。
4. シークレット登録とデプロイ（**`--no-verify-jwt` が必須**）：
```powershell
npx supabase secrets set LINE_CHANNEL_SECRET=<...> LINE_CHANNEL_ACCESS_TOKEN=<...>; npx supabase functions deploy line-webhook --no-verify-jwt; npx supabase functions deploy send-weekly-report
```
5. LINE Developers の Messaging API タブで、**Webhook URL** に `https://<PROJECT_REF>.supabase.co/functions/v1/line-webhook` を設定 → 「Webhookの利用」をオン → 「検証」で成功を確認。
6. LINE Official Account Manager の応答設定で、**応答メッセージはオフ**、Webhook はオン。

## 実機確認の基本
1. iPhone の Safari で GitHub Pages の URL を開く → 共有 → 「ホーム画面に追加」。
2. ホーム画面のアイコンから起動（全画面になること）。
3. 更新が反映されないときは、`sw.js` の `CACHE_VERSION` を上げて push し、アプリを完全に閉じてから開き直す。

## 運用の目安（2026年10月時点の調査）
- Supabase：無料プランは1週間まったく使わないとプロジェクトが一時停止し、週次メールも止まる。安定運用は Pro（月 $25）
- Resend：無料 月3,000通・1日100通 ／ LINE：無料 月200通 ／ Claude Haiku 4.5：入力 $1・出力 $5 / 100万トークン
- 料金は変わるので、使い始めるときに各公式ページで確認する
