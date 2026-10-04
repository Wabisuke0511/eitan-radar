// Phase 1 の動作確認：submit_session の集計と RLS（他の保護者のデータが見えない）
// 使い方（PowerShell）。値は環境変数から読む。鍵やPINをファイルに書かない。
//   $env:SUPABASE_URL="https://<ref>.supabase.co"; $env:SUPABASE_ANON_KEY="<anon>"
//   $env:TEST_A_ID="..."; $env:TEST_A_PIN="..."; $env:TEST_B_ID="..."; $env:TEST_B_PIN="..."
//   node scripts/test-rls.mjs
// A と B はアプリで先に作った「テスト用」アカウント。A には 5級を3周ぶん保存する（5級クリアまで進む）。
const { SUPABASE_URL: URL_, SUPABASE_ANON_KEY: KEY, TEST_A_ID, TEST_A_PIN, TEST_B_ID, TEST_B_PIN } = process.env;
for (const [k, v] of Object.entries({ SUPABASE_URL: URL_, SUPABASE_ANON_KEY: KEY, TEST_A_ID, TEST_A_PIN, TEST_B_ID, TEST_B_PIN })) {
  if (!v) { console.error(`環境変数 ${k} が未設定です`); process.exit(2); }
}

let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };

async function call(path, { token, method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(URL_ + path, {
    method,
    headers: { apikey: KEY, Authorization: `Bearer ${token || KEY}`, 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* 本文が JSON でない */ }
  return { status: res.status, ok: res.ok, json };
}
async function login(id, pin) {
  const r = await call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: `${id}@eitan-radar.invalid`, password: pin } });
  if (!r.ok) throw new Error(`ログイン失敗 (${id}): ${r.status} ${r.json && (r.json.error_code || r.json.msg)}`);
  return { token: r.json.access_token, uid: r.json.user.id };
}
async function ensureChild(u) {
  let r = await call('/rest/v1/children?select=id&order=created_at.asc&limit=1', { token: u.token });
  if (r.ok && r.json.length) return r.json[0].id;
  r = await call('/rest/v1/children?select=id', { token: u.token, method: 'POST', body: { parent_id: u.uid, name: 'テスト' }, headers: { Prefer: 'return=representation' } });
  if (!r.ok) throw new Error('children の作成に失敗: ' + JSON.stringify(r.json));
  return r.json[0].id;
}
const sumSeen = rows => rows.reduce((a, x) => a + x.seen, 0);

const A = await login(TEST_A_ID, TEST_A_PIN), B = await login(TEST_B_ID, TEST_B_PIN);
const childA = await ensureChild(A), childB = await ensureChild(B);
check('A と B は別のユーザー', A.uid !== B.uid);

// --- ① A: 5級の全語を3周 → item_stats / level_progress が更新される ---
const vocab = await call('/rest/v1/vocab_items?select=id&level=eq.5&active=eq.true&order=id.asc', { token: A.token });
const ids5 = vocab.json.map(x => x.id);
check('5級の語が読める（31語）', vocab.ok && ids5.length === 31, `n=${ids5.length}`);

const stats = async () => (await call(`/rest/v1/item_stats?select=item_id,mode,seen,correct&child_id=eq.${childA}&item_id=in.(${ids5.join(',')})`, { token: A.token })).json;
const before = sumSeen(await stats());
let newlyAll = [];
for (let round = 1; round <= 3; round++) {
  const r = await call('/rest/v1/rpc/submit_session', {
    method: 'POST', token: A.token,
    body: { p_child: childA, p_started: new Date(Date.now() - 60000).toISOString(), p_answers: ids5.map(id => ({ item_id: id, mode: 'en2ja', correct: true })) },
  });
  check(`submit_session ${round}回目`, r.ok && r.json && Array.isArray(r.json.newly_cleared), r.ok ? '' : JSON.stringify(r.json));
  if (r.ok) newlyAll = newlyAll.concat(r.json.newly_cleared);
}
const after = sumSeen(await stats());
check('item_stats の出題数が 31語×3回 ふえた', after - before === 93, `before=${before} after=${after}`);
const prog = await call(`/rest/v1/level_progress?select=level&child_id=eq.${childA}`, { token: A.token });
check('level_progress に 5級がある', prog.ok && prog.json.some(x => x.level === '5'), `newly_cleared(合計)=${JSON.stringify(newlyAll)}`);
const sess = await call(`/rest/v1/study_sessions?select=id,question_count&child_id=eq.${childA}`, { token: A.token });
check('study_sessions が読める', sess.ok && sess.json.length >= 3, `n=${sess.json && sess.json.length}`);

// --- ② B から A のデータが読めない / 書けない（RLS） ---
for (const t of ['item_stats', 'level_progress', 'study_sessions', 'answer_logs', 'report_settings', 'report_logs']) {
  const r = await call(`/rest/v1/${t}?select=child_id&child_id=eq.${childA}`, { token: B.token });
  check(`B は A の ${t} を読めない`, r.ok && r.json.length === 0, `status=${r.status} rows=${r.json && r.json.length}`);
}
const kids = await call('/rest/v1/children?select=id', { token: B.token });
check('B の children は自分の分だけ', kids.ok && kids.json.every(x => x.id === childB) && !kids.json.some(x => x.id === childA));
const bw = await call('/rest/v1/rpc/submit_session', {
  method: 'POST', token: B.token,
  body: { p_child: childA, p_started: new Date().toISOString(), p_answers: [{ item_id: ids5[0], mode: 'en2ja', correct: true }] },
});
check('B は A の child_id で submit_session できない', !bw.ok, `status=${bw.status}`);
const bi = await call('/rest/v1/answer_logs', { method: 'POST', token: B.token, body: { child_id: childA, item_id: ids5[0], mode: 'en2ja', correct: true } });
check('B は A の answer_logs に書けない', !bi.ok, `status=${bi.status}`);
const sync = await call('/rest/v1/rpc/sync_level_progress', { method: 'POST', token: B.token, body: { p_child: childA } });
check('B は A の sync_level_progress を呼べない', !sync.ok, `status=${sync.status}`);
const a2 = sumSeen(await stats());
check('B の攻撃のあとも A の出題数は変わらない', a2 === after);

// --- ③ 未ログイン（anon）には本アプリのテーブルが見えない ---
for (const t of ['vocab_items', 'children', 'item_stats']) {
  const r = await call(`/rest/v1/${t}?select=*&limit=1`);
  check(`anon は ${t} を読めない`, !r.ok || (Array.isArray(r.json) && r.json.length === 0), `status=${r.status}`);
}

console.log(failed ? `\n${failed} 件 FAIL` : '\nすべて PASS');
process.exit(failed ? 1 : 0);
