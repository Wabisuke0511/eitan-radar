// 語彙 TSV（supabase/seed/vocab/vocab_*.tsv）を検査して、取り込み用 SQL（同じフォルダの .sql）を作る。
// 使い方：node scripts/vocab/build-seed.mjs 5   → supabase/seed/vocab/vocab_5.sql
// 列：level, type, theme, en, ja, example_en, example_ja（例文の覚える部分は [[ ]] で囲む）
// 出典：単語の選定は CEFR-J Wordlist Version 1.6（東京外国語大学投野由紀夫研究室）を元にしている
import fs from 'node:fs';
import path from 'node:path';

const LEVELS = ['5', '4', '3', 'p2', '2', 'p1'];
const TYPES = ['word', 'phrase', 'idiom'];
const lv = process.argv[2];
if (!LEVELS.includes(lv)) { console.error('級を指定してください：' + LEVELS.join(' / ')); process.exit(2); }
const dir = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '../../supabase/seed/vocab');
const src = path.join(dir, `vocab_${lv}.tsv`);
const lines = fs.readFileSync(src, 'utf8').replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim());
const head = lines.shift().split('\t');
const want = ['level', 'type', 'theme', 'en', 'ja', 'example_en', 'example_ja'];
if (head.join() !== want.join()) { console.error('見出し行がちがいます：' + head.join()); process.exit(1); }

const errors = [], warns = [], rows = [], seenEn = new Map(), seenJa = new Map();
lines.forEach((line, i) => {
  const n = i + 2, c = line.split('\t');
  while (c.length < 7) c.push('');
  const [level, type, theme, en, ja, exEn, exJa] = c.map((s) => s.trim());
  if (c.length > 7) errors.push(`${n}行：列が多すぎます`);
  if (level !== lv) errors.push(`${n}行：級が ${level}（ファイルは ${lv}）`);
  if (!TYPES.includes(type)) errors.push(`${n}行：type が不正 ${type}`);
  if (!theme || !en || !ja) errors.push(`${n}行：theme / en / ja が空`);
  const key = en.toLowerCase();
  if (seenEn.has(key)) errors.push(`${n}行：英語が重複（${seenEn.get(key)}行目と同じ）${en}`); else seenEn.set(key, n);
  if (seenJa.has(ja)) warns.push(`${n}行：日本語が ${seenJa.get(ja)}行目と同じ（選択肢で区別しにくい）${ja}`); else seenJa.set(ja, n);
  const mark = (s) => (s.match(/\[\[(.+?)\]\]/g) || []).length;
  if (type !== 'word' && !(exEn && exJa)) errors.push(`${n}行：熟語・会話表現には例文が必要 ${en}`);
  if (exEn && mark(exEn) !== 1) errors.push(`${n}行：英語の例文に [[ ]] がちょうど1つ必要`);
  if (exJa && mark(exJa) !== 1) errors.push(`${n}行：日本語の例文に [[ ]] がちょうど1つ必要`);
  rows.push({ level, type, theme, en, ja, exEn, exJa });
});
// ほかの級の TSV と英語が重なっていないか（同じ語を2つの級で出さない）
for (const other of LEVELS.filter((x) => x !== lv)) {
  const f = path.join(dir, `vocab_${other}.tsv`);
  if (!fs.existsSync(f)) continue;
  const ens = new Set(fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n').split('\n').slice(1).map((l) => (l.split('\t')[3] || '').trim().toLowerCase()).filter(Boolean));
  rows.forEach((r) => { if (ens.has(r.en.toLowerCase())) warns.push(`${other}級にも同じ英語があります：${r.en}`); });
}
warns.forEach((w) => console.warn('注意 ' + w));
if (errors.length) { errors.forEach((e) => console.error('エラー ' + e)); process.exit(1); }

const q = (s) => (s ? `'${s.replace(/'/g, "''")}'` : 'null');
const values = rows.map((r) => `  (${q(r.level)}, ${q(r.en)}, ${q(r.ja)}, ${q(r.type)}, ${q(r.theme)}, ${q(r.exEn)}, ${q(r.exJa)}, true)`).join(',\n');
const sql = `-- ${lv === 'p2' ? '準2' : lv === 'p1' ? '準1' : lv}級の語彙（${rows.length}語）。scripts/vocab/build-seed.mjs で vocab_${lv}.tsv から生成。手で編集しない。
-- 単語の選定は CEFR-J Wordlist Version 1.6（東京外国語大学投野由紀夫研究室）を元にしている。
-- Supabase の SQL Editor で実行する。同じ (level, en) があれば内容を上書きし、id は変えない（記録を壊さない）。
begin;
${lv === '5' ? '-- 動作確認用のサンプル（id 1〜101）は使わない。同じ語は下の insert で有効に戻る（この処理は5級の SQL だけに入れる）\nupdate public.vocab_items set active = false where id between 1 and 101;\n' : ''}insert into public.vocab_items (level, en, ja, type, theme, example_en, example_ja, active) values
${values}
on conflict (level, en) do update set
  ja = excluded.ja, type = excluded.type, theme = excluded.theme,
  example_en = excluded.example_en, example_ja = excluded.example_ja, active = true;
commit;
`;
fs.writeFileSync(path.join(dir, `vocab_${lv}.sql`), sql);
const by = rows.reduce((m, r) => ((m[r.type] = (m[r.type] || 0) + 1), m), {});
console.log(`OK ${rows.length}語 ${JSON.stringify(by)} → vocab_${lv}.sql`);
