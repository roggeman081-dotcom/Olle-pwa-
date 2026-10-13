// Proxy mellan O.L.L.E. och Composio. COMPOSIO_API_KEY ligger som Supabase-secret, aldrig i appen.
// Kräver inloggad Supabase-användare (verify_jwt är på som standard).
import { createClient } from "npm:@supabase/supabase-js@2";

const COMPOSIO_URL = "https://backend.composio.dev/api/v3";

// Lägg bara till verktyg du faktiskt vill att appen får köra.
const ALLOWED_TOOLS = new Set<string>([
  "GMAIL_FETCH_EMAILS",
  "GOOGLECALENDAR_EVENTS_LIST",
]);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const apiKey = Deno.env.get("COMPOSIO_API_KEY");
  if (!apiKey) return json({ error: "COMPOSIO_API_KEY saknas" }, 500);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: "Inte inloggad" }, 401);

  const { tool, arguments: args = {} } = await req.json().catch(() => ({}));
  if (typeof tool !== "string" || !ALLOWED_TOOLS.has(tool)) {
    return json({ error: `Verktyget är inte tillåtet: ${tool}` }, 403);
  }

  const res = await fetch(`${COMPOSIO_URL}/tools/execute/${encodeURIComponent(tool)}`, {
    method: "POST",
    headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: user.id, arguments: args }),
  });
  return json(await res.json().catch(() => ({})), res.status);
});
