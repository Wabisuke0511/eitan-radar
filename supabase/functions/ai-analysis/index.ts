// 弱点マップのAI分析。POST { child_id, summary } （ログイン中の保護者の JWT 必須）
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json, env, jstParts } from "../_shared/util.ts";
import { askClaudeJSON } from "../_shared/anthropic.ts";
import { aiAnalysisPrompt } from "../_shared/prompts.ts";

const DAILY_LIMIT = 20;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = env("SUPABASE_URL");
    const userClient = createClient(url, env("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const { child_id, summary } = await req.json();
    if (!child_id || typeof summary !== "object" || summary === null) return json({ error: "bad_request" }, 400);
    if (JSON.stringify(summary).length > 20000) return json({ error: "too_large" }, 413);

    // 自分の子どもか（RLS で自分の行しか返らない）
    const { data: child } = await userClient.from("children").select("id").eq("id", child_id).maybeSingle();
    if (!child) return json({ error: "forbidden" }, 403);

    // 1日の上限
    const admin = createClient(url, env("SUPABASE_SERVICE_ROLE_KEY"));
    const day = jstParts().date;
    const { data: row } = await admin.from("ai_usage").select("count")
      .eq("child_id", child_id).eq("day", day).eq("kind", "analysis").maybeSingle();
    const used = row?.count ?? 0;
    if (used >= DAILY_LIMIT) return json({ error: "rate_limited" }, 429);
    await admin.from("ai_usage").upsert({ child_id, day, kind: "analysis", count: used + 1 });

    const result = await askClaudeJSON(aiAnalysisPrompt(summary), 1800);
    return json(result);
  } catch (e) {
    console.error(e);
    return json({ error: "internal" }, 500);
  }
});
