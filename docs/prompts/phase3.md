# Phase 3 プロンプト（LINE 連携）

事前：Phase 2 の実機確認が完了。`docs/setup.md` の「Phase 3 の準備」を人間側で実施（LINE 公式アカウント・Messaging API・Webhook URL・シークレット・`line-webhook` を `--no-verify-jwt` でデプロイ）。

```
Phase 2 の実機確認が終わりました。Phase 3（LINE連携）に進みます。CLAUDE.md と docs/spec.md の「6. 週間レポート」を読み直してください。

【ゴール】週間レポートを LINE でも受け取れるようにする。

【やること】
1. FEATURES.line を true にし、モックの「LINEの連携」UI を本番化する。
   - LINE を選ぶと rpc('create_line_code', { p_child }) で6桁コードを発行して表示（10分有効。期限切れ表示と「新しいコードを作る」ボタンを付ける）
   - 連携済みかどうかは report_settings.line_user_id の有無で判定。コード表示中は5秒ごとに report_settings を取得して、連携されたら「連携しました」に切り替える（画面を離れたら止める）
   - 連携の解除：クライアントは line_user_id を更新できないので、line_enabled を false にするだけにする（解除の意味を画面で説明）。line_user_id 自体の削除が必要なら新しいマイグレーション（RPC）を提案して私に確認
   - 「今すぐ送信」は選択中のすべてのチャネルに送る。結果はチャネルごとに表示
2. supabase/functions/line-webhook と send-weekly-report の LINE 部分を確認する。署名検証（X-Line-Signature）・連携コードの消費・push 送信が正しいかをコードレビューし、問題があれば直す。
3. 動作確認を自分で行って報告する：
   - 署名なし／不正署名のリクエストが 401 になる
   - 正しい署名のサンプルイベント（follow / 6桁コードのメッセージ）で期待どおりの返信 API 呼び出しになる（ローカルでモックして確認）
4. sw.js の CACHE_VERSION を上げる。git commit（feat: phase3 line integration）。CLAUDE.md の決定事項ログを更新。

【やらないこと】スキーマの大きな変更、デザイン変更、LINE のリッチメッセージ化（テキストのみ）。

【最後に報告】①変えたこと ②私が実機で確認する項目（spec.md 11 の Phase 3） ③無料枠（月200通）の消費に関する注意
```
