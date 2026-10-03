// 週間レポートの送信。
//  - cron:   POST { mode:"cron" }  Authorization: Bearer <service_role>  → いまが設定の曜日・時刻(JST)の人に自動送信
//  - manual: POST { child_id }     Authorization: Bearer <ユーザーJWT>    → 「今すぐ送信」
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json, env, jstParts } from "../_shared/util.ts";
import { askClaudeJSON } from "../_shared/anthropic.ts";
import { weeklyCommentPrompt } from "../_shared/prompts.ts";

const LEVELS = ["5", "4", "3", "p2", "2", "p1"];
const LV_NAME: Record<string, string> = { "5": "5級", "4": "4級", "3": "3級", p2: "準2級", "2": "2級", p1: "準1級" };
const MODE_NAME: Record<string, string> = { en2ja: "英→和", ja2en: "和→英", spell: "スペル" };
const DOW = ["日", "月", "火", "水", "木", "金", "土"];
const MANUAL_LIMIT_PER_DAY = 3;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = env("SUPABASE_URL");
    const admin = createClient(url, env("SUPABASE_SERVICE_ROLE_KEY"));
    const body = await req.json().catch(() => ({}));
    const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");

    // ---- cron ----
    if (body.mode === "cron") {
      if (bearer !== env("SUPABASE_SERVICE_ROLE_KEY")) return json({ error: "forbidden" }, 403);
      const now = jstParts();
      const { data: targets } = await admin.from("report_settings").select("*")
        .eq("enabled", true).eq("dow", now.dow).eq("hour", now.hour);
      const results = [];
      for (const t of targets ?? []) {
        // 二重送信防止：6日以内に自動送信済みならスキップ
        if (t.last_sent_at && Date.now() - new Date(t.last_sent_at).getTime() < 6 * 86400_000) continue;
        results.push(await sendOne(admin, t, "auto"));
      }
      return json({ count: results.length, results });
    }

    // ---- manual ----
    const userClient = createClient(url, env("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: `Bearer ${bearer}` } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);
    const childId = body.child_id;
    if (!childId) return json({ error: "bad_request" }, 400);
    const { data: child } = await userClient.from("children").select("id").eq("id", childId).maybeSingle();
    if (!child) return json({ error: "forbidden" }, 403);

    const since = new Date(Date.now() - 86400_000).toISOString();
    const { count } = await admin.from("report_logs").select("id", { count: "exact", head: true })
      .eq("child_id", childId).eq("kind", "manual").gte("created_at", since);
    if ((count ?? 0) >= MANUAL_LIMIT_PER_DAY * 2) return json({ error: "rate_limited" }, 429); // 2チャネル分

    const { data: setting } = await admin.from("report_settings").select("*").eq("child_id", childId).maybeSingle();
    if (!setting) return json({ error: "no_settings" }, 400);
    return json({ results: await sendOne(admin, setting, "manual") });
  } catch (e) {
    console.error(e);
    return json({ error: "internal" }, 500);
  }
});

async function currentLevel(admin: SupabaseClient, childId: string) {
  const { data: cleared } = await admin.from("level_progress").select("level").eq("child_id", childId);
  const done = new Set((cleared ?? []).map((r: any) => r.level));
  const lv = LEVELS.find((l) => !done.has(l));
  if (!lv) return null;
  const { data } = await admin.rpc("level_stat", { p_child: childId, p_level: lv });
  const st = Array.isArray(data) ? data[0] : data;
  return { level: lv, name: LV_NAME[lv], accuracy: st?.attempts ? Math.floor((100 * st.correct) / st.attempts) : 0 };
}

async function sendOne(admin: SupabaseClient, s: any, kind: "auto" | "manual") {
  const { data: child } = await admin.from("children").select("name").eq("id", s.child_id).single();
  const { date } = jstParts();
  const { data: summary } = await admin.rpc("weekly_summary", { p_child: s.child_id, p_end: date, p_tz: s.timezone ?? "Asia/Tokyo" });
  const { data: weak } = await admin.rpc("weak_overview", { p_child: s.child_id });
  const level = await currentLevel(admin, s.child_id);

  const tw = summary.thisWeek, lw = summary.lastWeek;
  const acc = (w: any) => (w.questions ? Math.round((100 * w.correct) / w.questions) : null);
  const minutes = Math.round(tw.seconds / 60);
  const modeAcc = Object.fromEntries(Object.entries(summary.byMode ?? {}).map(([m, v]: any) => [MODE_NAME[m] ?? m, Math.round((100 * v.c) / v.n)]));

  let comment: { comment?: string; goal?: string; kid?: string } | null = null;
  try {
    comment = await askClaudeJSON(weeklyCommentPrompt({
      period: summary.period,
      thisWeek: { days: tw.days, questions: tw.questions, minutes, accuracy: acc(tw), byMode: modeAcc },
      lastWeek: { days: lw.days, questions: lw.questions, minutes: Math.round(lw.seconds / 60), accuracy: acc(lw) },
      dailyQuestions: summary.daily,
      currentLevel: level ? `${level.name} 正答率${level.accuracy}%（クリアは90%）` : "全級クリア",
      weakestArea: weak?.weakestCell ? `${weak.weakestCell.theme} × ${MODE_NAME[weak.weakestCell.mode]}（${weak.weakestCell.accuracy}%）` : null,
      weakWords: (weak?.worstWords ?? []).map((w: any) => `${w.en}（${w.ja}）`),
    }), 800);
  } catch (e) { console.error("comment failed", e); }

  const view = { name: child?.name ?? "お子さま", summary, tw, lw, acc: acc(tw), accLast: acc(lw), minutes, minutesLast: Math.round(lw.seconds / 60), modeAcc, level, weak, comment };
  const period = `${summary.period.from.slice(5).replace("-", "/")}〜${summary.period.to.slice(5).replace("-", "/")}`;
  const subject = `【えいたんレーダー】${view.name}さんの今週の学習レポート（${period}）`;

  const results: { channel: string; status: string; error?: string }[] = [];

  if (s.email_enabled && s.email) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: env("REPORT_FROM"), to: [s.email], subject, html: renderHtml(view, period), text: renderText(view, period) }),
      });
      if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
      results.push({ channel: "email", status: "sent" });
    } catch (e) { results.push({ channel: "email", status: "failed", error: String(e).slice(0, 300) }); }
  }

  if (s.line_enabled && s.line_user_id) {
    try {
      const res = await fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: { Authorization: `Bearer ${env("LINE_CHANNEL_ACCESS_TOKEN")}`, "Content-Type": "application/json" },
        body: JSON.stringify({ to: s.line_user_id, messages: [{ type: "text", text: renderText(view, period) }] }),
      });
      if (!res.ok) throw new Error(`LINE ${res.status}: ${await res.text()}`);
      results.push({ channel: "line", status: "sent" });
    } catch (e) { results.push({ channel: "line", status: "failed", error: String(e).slice(0, 300) }); }
  }

  if (results.length) {
    await admin.from("report_logs").insert(results.map((r) => ({ child_id: s.child_id, kind, channel: r.channel, status: r.status, error: r.error ?? null })));
    if (kind === "auto" && results.some((r) => r.status === "sent")) {
      await admin.from("report_settings").update({ last_sent_at: new Date().toISOString() }).eq("child_id", s.child_id);
    }
  }
  return { child_id: s.child_id, results };
}

const diff = (a: number | null, b: number | null, unit: string) =>
  a == null || b == null ? "" : a - b > 0 ? `（先週より +${a - b}${unit}）` : a - b < 0 ? `（先週より ${a - b}${unit}）` : "（先週と同じ）";

function renderText(v: any, period: string): string {
  const L: string[] = [];
  L.push(`📊 ${v.name}さんの今週の学習（${period}）`, "");
  L.push(`学習した日：${v.tw.days}/7日 ${diff(v.tw.days, v.lw.days, "日")}`);
  L.push(`問題数：${v.tw.questions}問 ${diff(v.tw.questions, v.lw.questions, "問")}`);
  L.push(`学習時間：${v.minutes}分 ${diff(v.minutes, v.minutesLast, "分")}`);
  L.push(`正答率：${v.acc ?? "–"}% ${diff(v.acc, v.accLast, "pt")}`);
  if (Object.keys(v.modeAcc).length) L.push("", "問題の形べつ：" + Object.entries(v.modeAcc).map(([k, x]) => `${k} ${x}%`).join(" / "));
  if (v.level) L.push("", `🚩 いまの級：${v.level.name}（正答率${v.level.accuracy}% ／ クリアは90%）`);
  else L.push("", "🏆 ぜんぶの級をクリアしました！");
  if (v.weak?.weakestCell) L.push(`気になるところ：${v.weak.weakestCell.theme} × ${MODE_NAME[v.weak.weakestCell.mode]}（${v.weak.weakestCell.accuracy}%）`);
  if (v.comment?.comment) L.push("", `💬 ${v.comment.comment}`, `🎯 来週の目標：${v.comment.goal ?? ""}`);
  L.push("", "※ 配信の停止は、アプリの「週間レポート」設定でオフにできます。");
  return L.join("\n");
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function renderHtml(v: any, period: string): string {
  const max = Math.max(1, ...v.summary.daily.map((d: any) => d.questions));
  const bars = v.summary.daily.map((d: any) => {
    const dow = DOW[new Date(d.date + "T00:00:00+09:00").getDay()];
    const w = Math.round((d.questions / max) * 100);
    return `<tr><td style="width:28px;color:#475569;font-size:13px">${dow}</td><td><div style="background:#3b5bdb;height:14px;border-radius:7px;width:${Math.max(w, d.questions ? 4 : 0)}%"></div></td><td style="width:36px;text-align:right;color:#475569;font-size:13px">${d.questions || ""}</td></tr>`;
  }).join("");
  const kpi = (n: string, label: string, sub: string) => `<td style="background:#eef1f9;border-radius:12px;padding:12px;width:50%"><div style="font-size:24px;font-weight:800;color:#1e3a5f">${n}</div><div style="font-size:12px;color:#475569">${label}</div><div style="font-size:12px;color:#94a3b8">${sub}</div></td>`;
  return `<!doctype html><html><body style="margin:0;background:#f4f6fb;font-family:-apple-system,'Hiragino Sans',sans-serif;color:#1e3a5f">
<div style="max-width:520px;margin:0 auto;padding:16px">
<div style="background:#fff;border:1px solid #dde3f0;border-radius:16px;padding:20px">
<div style="font-size:18px;font-weight:800">${esc(v.name)}さんの今週の学習</div><div style="font-size:13px;color:#475569;margin-bottom:12px">${esc(period)}（直近7日）</div>
<table role="presentation" width="100%" cellspacing="8"><tr>${kpi(`${v.tw.days}<small style="font-size:13px"> / 7日</small>`, "学習した日", diff(v.tw.days, v.lw.days, "日"))}${kpi(`${v.tw.questions}<small style="font-size:13px"> 問</small>`, "とりくんだ問題", diff(v.tw.questions, v.lw.questions, "問"))}</tr>
<tr>${kpi(`${v.minutes}<small style="font-size:13px"> 分</small>`, "学習時間", diff(v.minutes, v.minutesLast, "分"))}${kpi(`${v.acc ?? "–"}<small style="font-size:13px">%</small>`, "正答率", diff(v.acc, v.accLast, "pt"))}</tr></table>
<div style="font-weight:800;font-size:13px;margin:14px 0 6px">毎日の問題数</div><table role="presentation" width="100%" cellspacing="4">${bars}</table>
<div style="font-weight:800;font-size:13px;margin:14px 0 6px">問題の形べつ 正答率</div><div style="font-size:14px">${Object.entries(v.modeAcc).map(([k, x]) => `${esc(k)} <b>${x}%</b>`).join("　") || "–"}</div>
<div style="font-weight:800;font-size:13px;margin:14px 0 6px">ロードマップ</div><div style="font-size:14px">${v.level ? `🚩 いまの級：<b>${esc(v.level.name)}</b>（正答率 ${v.level.accuracy}% ／ クリアは90%）` : "🏆 ぜんぶの級をクリアしました！"}</div>
${v.weak?.weakestCell ? `<div style="font-weight:800;font-size:13px;margin:14px 0 6px">気になるところ（累計）</div><div style="font-size:14px">いちばん苦手：<b>${esc(v.weak.weakestCell.theme)} × ${esc(MODE_NAME[v.weak.weakestCell.mode])}</b>（${v.weak.weakestCell.accuracy}%）</div>` : ""}
${v.weak?.worstWords?.length ? `<div style="font-size:13px;color:#475569;margin-top:4px">まちがいが多い語：${v.weak.worstWords.map((w: any) => `${esc(w.en)}（${esc(w.ja)}）`).join("、")}</div>` : ""}
${v.comment?.comment ? `<div style="font-weight:800;font-size:13px;margin:14px 0 6px">コーチからのコメント</div><div style="font-size:14px">${esc(v.comment.comment)}</div><div style="font-size:14px;margin-top:6px"><b>来週の目標：</b>${esc(v.comment.goal)}</div>${v.comment.kid ? `<div style="background:#ecfdf3;border-radius:12px;padding:10px 14px;margin-top:10px;font-weight:700">💬 ${esc(v.comment.kid)}</div>` : ""}` : ""}
</div>
<div style="font-size:12px;color:#94a3b8;text-align:center;margin-top:12px">配信の停止は、アプリの「週間レポート」設定でオフにできます。</div>
</div></body></html>`;
}
