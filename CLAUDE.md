# えいたんレーダー — Claude Code 向けプロジェクト指示

> 最初にこのファイルを読み、続けて `docs/spec.md` → `docs/data-model.md` → `docs/setup.md` を読むこと。
> 見た目と動きの正解は `mock/index.html`（Claudeのチャットで作った動くモック）。**勝手にデザインを変えない。**

## これは何か
小学生向けの英検（5級〜準1級）英単語・熟語・イディオム学習 PWA。iPhone のホーム画面で使う。
最大の目的は「**子どもの弱点を網羅的に見つける**」こと。弱点を 級 × 種類 × テーマ × 問題の形 で可視化し、AI（Claude）が分析し、保護者に週間レポートを送る。
各級は「全語を3回以上こたえ、正答率90%以上」でクリアしないと次の級に進めない（ゲーム形式のロードマップ）。

## 絶対ルール
1. **単一ファイル構成**：`index.html` に HTML/CSS/JS をすべて入れる。フレームワーク・ビルド工程は使わない。外部は CDN の Supabase JS v2 のみ。
2. **配色は明るいライトのみ**。ダークモード対応は入れない（`color-scheme: light`）。トークンは `docs/spec.md` 参照。
3. **秘密情報**：HTML に書いてよいのは Supabase の `anon` キーだけ。`service_role` / `ANTHROPIC_API_KEY` / `RESEND_API_KEY` / `LINE_*` は Edge Function の Secrets にのみ置く。Git にコミットしない。`.env` は `.gitignore`。
4. **RLS 必須**：全テーブルで有効。ポリシーは `supabase/migrations/` に書いてあるものが正。変更するときは新しいマイグレーションを足す（既存ファイルを書き換えない）。
5. **Service Worker は network-first**。`sw.js` の `CACHE_VERSION` を **push のたびに必ず上げる**（iOS PWA のキャッシュ対策）。あわせて `index.html` の `APP_VERSION` / `APP_DATE`（ホームのタイトル右に表示）も同じ番号・日付に上げる。
6. **iOS 対応**：`viewport-fit=cover`、safe-area、入力欄は `font-size:16px` 以上（ズーム防止）、タップ領域 44px 以上。
7. **フェーズ制**：Phase 1 → 実機確認 → Phase 2 → 実機確認 → Phase 3。確認なしに次へ進まない。未実装機能は UI ごと隠す（`FEATURES` フラグ）。
8. **変更は最小限**：既存コードの全面書き換えをしない。直す箇所だけ直す。
9. 判断が分かれる点は、コードを書く前に**選択肢（A/B/C）で質問**する。

## 技術スタック
- フロント：Vanilla JS 単一ファイル PWA（GitHub Pages で公開）、`manifest.json`、`sw.js`
- バックエンド：Supabase（Auth・Postgres・Edge Functions・pg_cron）
- AI：Claude API（`claude-haiku-4-5-20251001`）を **Edge Function 経由でのみ** 呼ぶ
- メール：Resend / LINE：Messaging API（Phase 3）

## ディレクトリ
```
index.html            ← mock/index.html を元に作る本体
manifest.json / sw.js / icons/
mock/index.html       ← 参照用モック（編集しない）
supabase/migrations/  ← スキーマ・RLS・RPC（正）
supabase/seed/        ← 語彙サンプル（本番ライブラリは別作業）
supabase/sql/cron.sql ← 週次送信の定期実行（手動実行）
supabase/functions/   ← ai-analysis / send-weekly-report / line-webhook
docs/                 ← 仕様・データ設計・セットアップ・各フェーズのプロンプト
```

## 作業ルール
- コマンドは PowerShell で動く形にし、複数手順は `;` でつないだ1行にまとめる。
- 日付・時刻の表示と集計は **JST**（`Asia/Tokyo`）。
- 作業の最後に、①何を変えたか ②実機で確認してほしい項目 ③次フェーズで必要な手作業 を短く報告する。
- 決まったこと・変えたことは、このファイルの「決定事項ログ」に1行で追記し、コミットする。

## フェーズ
| Phase | 内容 | 完了条件 |
|---|---|---|
| 0 | リポジトリ・Supabase・GitHub Pages の準備（人間の作業、`docs/setup.md`） | ログインできる状態 |
| 1 | コア：ログイン・クイズ・ロードマップ・弱点マップ・単語帳 を Supabase 化 | 実機（iPhone）で一通り動く |
| 2 | AI分析 + 週間レポート（メール）+「今すぐ送信」 | 実際にメールが届く |
| 3 | LINE 連携 | LINE にレポートが届く |
| 4 | 語彙ライブラリの拡充（別作業。5級から順に） | — |

## 決定事項ログ
- 2026-10-03: v1 は認証あり（保護者がメールOTPでログイン）。子どもは保護者アカウント配下の `children` 行。UI は子ども1人想定、DB は複数対応。
- 2026-10-03: クリア条件＝全語3回以上＋正答率90%（`GATE=0.9`, `MINSEEN=3`）。変える場合は SQL の `sync_level_progress` と JS の両方を直す。
- 2026-10-03: 問題の形は 英→和 / 和→英 / スペル の3つ（聞き取りは廃止）。
- 2026-10-04: Supabase は既存プロジェクト bpulse-check（otorkvmcnhwspjwypurb, Tokyo）を共用する。bpulse-check は `bp_records` / `bp_profile` を anon で使うため、init マイグレーション（未適用だったので直接修正）の anon revoke を本アプリの10テーブルに限定した。今後も `public` 全体を対象にする revoke / grant / drop は書かない。Secrets も共用なので、Phase 2 で登録する前に既存の名前（例：`ANTHROPIC_API_KEY`）を確認する。
- 2026-10-04: 認証をメールOTPから「ログインID＋PIN」に変更（Supabase のメール/パスワード認証。ID から偽メール `<id>@eitan-radar.invalid` を作る）。理由：現在の Supabase はカスタム SMTP なしだとメールテンプレートを編集できず、6桁コードを送れないため。Auth の「Confirm email」はオフ、匿名サインインはオフ。2026-10-03 の「メールOTP」の記述はこれで置き換え。週間レポートの宛先メールは `report_settings.email` に保護者の実メールを別途入れる（Phase 2）。
- 2026-10-04: Phase 1 実装。`index.html` は `mock/index.html` から作成（デザイン不変）。級は内部で数値（25=準2級/15=準1級）、DB との変換は `LV_FROM_DB`。クイズの保存は終了時に `submit_session` を1回だけ。失敗したセッションは `PENDING` に残して再送（ホームに案内カード）。`FEATURES = { ai:false, report:false, line:false }` で AI分析・週間レポートを非表示（コードは残す）。`report_settings` は Phase 2 で読み書きする。`scripts/test-rls.mjs` は RLS と集計の確認用（鍵・ID・PIN は環境変数）。
- 2026-10-06: スペルの出題を「入力」から「並び替え」に変更（`mock/index.html` からの意図的な変更）。1語＝文字タイル、2語以上＝単語タイル。`mode` 名 `spell` と DB は変更なし。現在の語彙101語は動作確認用サンプルで、級の割り当ても仮（本番ライブラリは Phase 4）。
- 2026-10-06: オフライン対応（Phase 1 に追加）。語彙・成績を localStorage に保存して通信なしで開き、クイズ結果は端末に溜めて、つながったら自動送信（詳細は `docs/spec.md`「オフライン」）。`sw.js` は Supabase JS の CDN も保存（`CACHE_VERSION` は `eitan-v3`）。
- 2026-10-06: Phase 1 完了。受け入れ条件 ①〜⑦ を確認（①②③④⑤⑥ は iPhone 実機、⑦ は `scripts/test-rls.mjs` で全 PASS）。オフライン動作も実機で確認。次は Phase 2。
- 2026-10-06: クリア条件を変更（2026-10-03 の「全語3回以上」を置き換え）。全語を所定回数**正解**（5・4・3級=1回、準2級・2級・準1級=2回）＋級全体の正答率90%以上。SQL はマイグレーション `20261006000000_clear_by_correct.sql`（`level_req` と `sync_level_progress`）、JS は `REQ`。変えるときは両方直す。あわせて「まちがえた語テスト」（一度でもまちがえた語。れんしゅうの出し方＋ロードマップの各級）を追加。語彙は CEFR-J Wordlist（出典明記）＋EJDict-hand（CC0）＋人間の確認で作る方針。
- 2026-10-07: 本番語彙の作り方を決定。級ごとに `supabase/seed/vocab/vocab_<級>.tsv`（列：level, type, theme, en, ja, example_en, example_ja）を作り、`node scripts/vocab/build-seed.mjs <級>` で検査して SQL を生成し、SQL Editor で実行する（`(level,en)` で上書き。id は変えない）。熟語・会話表現は例文必須で、覚える部分を `[[ ]]` で囲む。例文はクイズの問題文（英→和は太字、和→英は日本語例文、スペルは空らんに並べる）と答えのあとに表示。熟語はユーザー提供の自作リスト（1,000個）を各級に配分して使う。単語帳に CEFR-J の出典を表示。テーマは16種類（`THEME_ORDER`）。
- 2026-10-08: 「おぼえた」＝その級のクリア条件の正解回数に届いた語（`mastered`）。Service Worker は自サイトのファイルを `cache:'no-cache'`／インストール時は `cache:'reload'` で取得し、GitHub Pages の HTTP キャッシュ（10分）で古い版が残らないようにした。新しい SW が有効になったら1回だけ自動で読み直す（クイズ中は除く）。
- 2026-10-08: 週間レポート（メール）を先に有効化（`FEATURES.report=true`、AI と LINE は未対応）。独自ドメインがないため、送信元は Resend のお試し用 `onboarding@resend.dev`（Resend に登録したアドレス宛てにのみ届く）。AI コメントは `ANTHROPIC_API_KEY` 未設定のあいだは付かない（送信は続行）。

## 未決事項（コードを書く前に確認）
- 語彙ライブラリの出どころ（市販単語帳の転載は不可。自作・生成して人間が確認）
- Resend の独自ドメイン（Phase 2 で必要）
- LINE 公式アカウント（Phase 3 で必要）
