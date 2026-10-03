// LINE Messaging API の Webhook（Phase 3）。デプロイは --no-verify-jwt が必要（LINE からの呼び出しには Supabase の JWT が付かないため）。
// 代わりに X-Line-Signature で本物の LINE からのリクエストか検証する。
import { createClient } from "npm:@supabase/supabase-js@2";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../_shared/util.ts";

async function reply(replyToken: string, text: string) {
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: { Authorization: `Bearer ${env("LINE_CHANNEL_ACCESS_TOKEN")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ replyToken, messages: [{ type: "text", text }] }),
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");
  const raw = await req.text();
  const sig = req.headers.get("x-line-signature") ?? "";
  const expected = createHmac("sha256", env("LINE_CHANNEL_SECRET")).update(raw).digest("base64");
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return new Response("invalid signature", { status: 401 });

  const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
  const body = JSON.parse(raw);

  for (const ev of body.events ?? []) {
    try {
      if (ev.type === "follow") {
        await reply(ev.replyToken, "ともだち追加ありがとうございます。アプリの「週間レポート」で表示される6けたの連携コードを、このトークに送ってください。");
      } else if (ev.type === "message" && ev.message?.type === "text") {
        const code = String(ev.message.text).trim();
        if (!/^\d{6}$/.test(code)) {
          await reply(ev.replyToken, "6けたの連携コードを送ってください。（アプリの「週間レポート」画面に表示されます）");
          continue;
        }
        const { data: row } = await admin.from("line_link_codes").select("code, child_id")
          .eq("code", code).is("used_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
        const userId = ev.source?.userId;
        if (!row || !userId) {
          await reply(ev.replyToken, "コードが見つからないか、期限が切れています。アプリで新しいコードを作ってください。");
          continue;
        }
        await admin.from("report_settings").upsert({ child_id: row.child_id, line_user_id: userId, line_enabled: true });
        await admin.from("line_link_codes").update({ used_at: new Date().toISOString() }).eq("code", code);
        await reply(ev.replyToken, "連携しました！毎週のレポートを、このトークにお届けします。");
      }
    } catch (e) { console.error("event failed", e); }
  }
  return new Response("ok");
});
