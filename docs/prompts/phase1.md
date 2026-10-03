# Phase 1 プロンプト（Claude Code に貼る）

事前：`docs/setup.md` の Phase 0 が完了していること（Supabase の URL と anon key を手元に）。

```
このリポジトリは「えいたんレーダー」（小学生向け・英検5級〜準1級の英単語PWA）です。
まず CLAUDE.md を読み、続けて docs/spec.md、docs/data-model.md、docs/setup.md を読んでください。見た目と動きの正解は mock/index.html です（mock は編集しない）。

【今回のゴール：Phase 1】
mock/index.html を元にルートへ index.html を作り、コア機能を Supabase で動く本番版にする。

【やること】
1. index.html を mock/index.html のコピーから作る。デザイン・文言・挙動は変えない。
2. Supabase JS v2 を CDN で読み込む。SUPABASE_URL と SUPABASE_ANON_KEY は <script> 先頭の定数にする。値が未設定なら、私に聞くこと（推測しない・service_role は絶対に使わない）。
3. 認証：メールOTP（signInWithOtp → verifyOtp, type:'email'）。ログイン画面を追加し、初回のみ子どもの名前入力 → children に insert。セッションは永続化。ログアウトはホーム下部の小さなリンクで。
4. docs/spec.md「8. モック → 本番の置き換え表」に従って置換する。
   - localStorage / seed() / デモデータ / 「デモデータに戻す」/ unlockAll（チェックボックス含む）を削除
   - 語彙は vocab_items、累計は item_stats、クリアは level_progress、連続日数・今日の問題数は study_sessions（すべて JST 集計）
   - クイズ中は回答を配列にため、終了時（途中終了でも1問以上あれば）に rpc('submit_session') を1回呼ぶ。戻り値の newly_cleared で結果画面のクリアバナーを出す。呼び出し後に item_stats と level_progress を再取得して画面更新
   - 通信エラー時は画面上に短い案内と「もう一度」ボタンを出す（結果は失われないよう、保存失敗時は配列を保持して再送できるようにする）
5. const FEATURES = { ai:false, report:false, line:false } を作り、AI分析カード・ホームの週間レポートカード・週間レポート画面を非表示にする（コードは残す）。
6. manifest.json / sw.js / icons を <head> からリンク（apple-touch-icon も）。sw.js は network-first のまま、今回は CACHE_VERSION を 'eitan-v1' にする。
7. 動作確認を自分で行い、結果を報告する：
   - node で index.html 内の <script> の構文チェック
   - テスト用スクリプト（scripts/test-rls.mjs。コミットしてよいが鍵は環境変数から読む）で、①ユーザーAで submit_session を2回呼び item_stats と level_progress が更新される ②ユーザーBからAのデータが読めない（RLS） を確認。テスト用ユーザーの作り方が必要なら私に聞く
8. git commit（feat: phase1 core on supabase）、CLAUDE.md の決定事項ログを更新。

【やらないこと】
AI分析・メール・LINE の実装、デザイン変更、mock の編集、スキーマの変更（必要なら新しいマイグレーションを提案して私に確認）。

【最後に報告】
①変えたこと ②私が iPhone で確認する項目（docs/spec.md「11. 受け入れ条件」Phase 1 の番号に対応させて） ③迷って決めたこと（あれば A/B で）
```

## 実機での確認（Phase 1）
spec.md 11 の Phase 1 の ①〜⑦。特に **③ 5級クリアの演出** は、デモ用に条件を下げず、サンプル31語で実際に試すか、Supabase の SQL Editor で `item_stats` に仮データを入れて確認する。
