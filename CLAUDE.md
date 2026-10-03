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
5. **Service Worker は network-first**。`sw.js` の `CACHE_VERSION` を **push のたびに必ず上げる**（iOS PWA のキャッシュ対策）。
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

## 未決事項（コードを書く前に確認）
- 語彙ライブラリの出どころ（市販単語帳の転載は不可。自作・生成して人間が確認）
- Resend の独自ドメイン（Phase 2 で必要）
- LINE 公式アカウント（Phase 3 で必要）
