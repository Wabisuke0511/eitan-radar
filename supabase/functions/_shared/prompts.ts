// プロンプト（モック mock/index.html の aiPrompt / repPrompt と同じ内容）
export const THEMES = ["たべもの", "どうぶつ", "がっこう", "ばしょ", "いろ・ようす", "うごき", "きもち", "かいわ"];

/** 弱点マップのAI分析。summary はクライアントが組み立てた集計 JSON（buildSummary の戻り値） */
export function aiAnalysisPrompt(summary: unknown): string {
  return `あなたは小学生向け英検対策（5級〜準1級）の学習コーチです。このアプリは、各級を「全語を3回以上こたえ、正答率90%以上」でクリアしないと次の級に進めない仕組みです。以下は、ある小学生の英単語アプリの回答データです。保護者がスマホで読む前提で、弱点を分析してください。

【データの見方】
- theme＝単語のテーマ、mode＝問題の形（en2ja=英語→日本語の意味、ja2en=日本語→英語を選ぶ、spell=つづりを書く）
- accuracy＝正答率(%)、attempts＝挑戦回数。attemptsが5未満のマスは断定せず「まだ判断できない」扱いにする
- byMode は "正解数/挑戦数"
- 数字は必ずこのデータにあるものだけを使う。推測で作らない

【ルール】
- 日本語。やさしく具体的に。責める表現は使わない
- 弱点は最大3つ。「どのテーマ×どの問題の形か」「何が起きていそうか（例：意味は分かるが書けない）」「家庭でできる具体策」をセットで
- 練習プランは最大3つ。theme は ${THEMES.join("/")} のいずれか、mode は en2ja/ja2en/spell のいずれか
- childMessage は小学生本人向けのひとこと（ひらがな多め、40字以内、前向きに）

【出力】JSONのみ。形式：
{"headline":"全体を一言で（30字以内）","summary":"保護者向け2〜3文","weaknesses":[{"theme":"うごき","mode":"spell","finding":"…","tip":"…"}],"strengths":["…"],"plan":[{"theme":"うごき","mode":"spell","reason":"…"}],"childMessage":"…"}

【データ】
${JSON.stringify(summary)}`;
}

/** 週間レポートのコーチコメント */
export function weeklyCommentPrompt(data: unknown): string {
  return `あなたは小学生向け英検対策アプリの学習コーチです。保護者に毎週送る学習レポートに載せるコメントを書いてください。

【ルール】
- 日本語。やさしく、前向きに。責めない。数字は下のデータにあるものだけを使う
- comment：今週の頑張りを具体的な数字で認めつつ、気づき（先週との違い、苦手の傾向）を2〜3文
- goal：来週の目標を1つ。数字つきで現実的に（例：「4日学習・合計60問」）
- kid：本人向けのひとこと（ひらがな多め、40字以内）

【出力】JSONのみ：{"comment":"…","goal":"…","kid":"…"}

【データ】
${JSON.stringify(data)}`;
}
