# えいたんレーダー — Claude Code ハンドオフセット（v1）

作成: 2026-10-03 JST

英検5級〜準1級の英単語アプリ。チャットで作ったモックを、Claude Code で本番化するための一式です。

## 中身
| ファイル | 役割 |
|---|---|
| `CLAUDE.md` | Claude Code が最初に読む指示（ルール・フェーズ・決定事項） |
| `docs/spec.md` | 仕様書（画面・ルール・判定・配色・モック→本番の置き換え表） |
| `docs/data-model.md` | データ設計の解説（テーブル・RPC・RLS） |
| `docs/setup.md` | 人間がやる準備（GitHub / Supabase / Resend / LINE）と、PowerShell コマンド |
| `docs/prompts/phase1〜3.md` | Claude Code に貼るプロンプト（フェーズごと） |
| `mock/index.html` | 動くモック（見た目と動きの基準） |
| `supabase/migrations/` | テーブル・RLS・RPC（ローカルの PostgreSQL で動作確認済み） |
| `supabase/seed/` | 語彙サンプル101語（SQL と CSV） |
| `supabase/functions/` | Edge Function 3本（構文チェック済み・実環境では未検証） |
| `supabase/sql/cron.sql` | 週次送信の定期実行 |
| `manifest.json` `sw.js` `icons/` | PWA 一式 |

## 進め方（最短）
1. `docs/setup.md` の Phase 0 を実施（GitHub リポジトリ・Supabase プロジェクト・マイグレーション・シード）
2. このフォルダをリポジトリのルートに置き、Claude Code を起動
3. `docs/prompts/phase1.md` を貼る → 実機確認
4. 問題なければ phase2 → 実機確認 → phase3

## 注意
- SQL は PostgreSQL 上で、クリア判定・RLS（他人のデータが見えない）・列権限・LINE コード発行まで確認済みです（Supabase 本体でのテストは未実施）。
- Edge Function は構文チェックのみ。**Supabase / Resend / LINE の実環境でのテストは未実施**です。各フェーズのプロンプトで、Claude Code に動作確認させます。
- 語彙は101語のサンプルです。本番ライブラリ（5級から順に）は別作業です。
