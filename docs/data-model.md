# データ設計

正は `supabase/migrations/20261003000000_init.sql`。ここは読み方のガイド。

## テーブル
| テーブル | 役割 | クライアント権限 |
|---|---|---|
| `children` | 保護者(`auth.users`)配下の子ども | 自分の行を読み書き |
| `vocab_items` | 語彙（級・英・和・種類・テーマ・例文） | 読み取りのみ（ログイン済み） |
| `study_sessions` | クイズ1回（出題数・正解数・所要秒・形別 `by_mode`） | 読み取り・insert |
| `answer_logs` | 1回答＝1行（語・形・正誤・時刻） | 読み取り・insert |
| `item_stats` | 語×形の累計（trigger が自動更新） | 読み取りのみ |
| `level_progress` | 級クリア履歴 | 読み取りのみ（書き込みは RPC 内） |
| `report_settings` | 週間レポート設定（送り先・曜日・時刻） | 読み取り・insert・一部列の update |
| `report_logs` | 送信履歴（Edge Function が書く） | 読み取りのみ |
| `line_link_codes` | LINE 連携コード（10分有効） | なし（RPC / webhook のみ） |
| `ai_usage` | AI の1日上限カウンタ | なし（Edge Function のみ） |

`report_settings` の `line_user_id` と `last_sent_at` は**列権限でクライアントから更新不可**（他人の LINE への送信や二重送信防止の改ざんを防ぐ）。

## RPC（`supabase.rpc(...)`）
| 関数 | 用途 |
|---|---|
| `submit_session(p_child, p_started, p_answers)` | クイズ1回分を保存。戻り値 `{session_id, newly_cleared[]}` |
| `level_stat(p_child, p_level)` | 級の `n / seen3 / attempts / correct` |
| `sync_level_progress(p_child)` | クリア判定（通常は `submit_session` が呼ぶ） |
| `weekly_summary(p_child, p_end, p_tz)` | 直近7日と前の7日のサマリ（週間レポート） |
| `weak_overview(p_child)` | 苦手マス・まちがいの多い語3つ |
| `create_line_code(p_child)` | LINE 連携コード発行 |

`p_answers` の形：`[{"item_id": 12, "mode": "en2ja", "correct": true}, ...]`（1〜100件）

## 主なクエリ例（クライアント）
```js
// 語彙（起動時に全件）
const { data: vocab } = await sb.from('vocab_items').select('id,level,en,ja,type,theme').eq('active', true);
// 累計
const { data: stats } = await sb.from('item_stats').select('item_id,mode,seen,correct').eq('child_id', childId);
// クリア済みの級
const { data: cleared } = await sb.from('level_progress').select('level').eq('child_id', childId);
// 直近のまちがい
const { data: wrong } = await sb.from('answer_logs').select('item_id').eq('child_id', childId).eq('correct', false).order('answered_at', { ascending: false }).limit(40);
// クイズ保存
const { data: res } = await sb.rpc('submit_session', { p_child: childId, p_started: startedISO, p_answers: answers });
```

## 注意
- `item_stats` は trigger で更新されるため、**answer_logs を直接 insert する場合も整合する**が、通常は `submit_session` のみを使う
- 語彙を差し替えるときは `vocab_items.id` を変えない（ログが壊れる）。削除せず `active=false`
- 級の追加・順序変更はスキーマ変更が必要（check 制約と `sync_level_progress` の配列）
