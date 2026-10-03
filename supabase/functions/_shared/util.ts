// 共通ユーティリティ（Edge Function 用 / Deno）
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // 本番では GitHub Pages のオリジンに絞ってよい
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

/** JST の現在の曜日(0=日)・時・日付(YYYY-MM-DD)を返す */
export function jstParts(d = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", weekday: "short", hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    dow: dowMap[p.weekday],
    hour: Number(p.hour) % 24,
    date: `${p.year}-${p.month}-${p.day}`,
  };
}

export const pct = (x: number | null | undefined) => (x == null ? null : Math.round(x * 100));
