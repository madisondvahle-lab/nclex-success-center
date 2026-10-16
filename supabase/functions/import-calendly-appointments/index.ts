import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://portal.studywithmadison.com",
  "https://madisondvahle-lab.github.io",
]);
const apiBase = "https://api.calendly.com";
const DAY_MS = 24 * 60 * 60 * 1000;
const EVENT_TYPES: Record<string, string> = {
  "Free Consultation": "free_consultation",
  "NCLEX Strategy Consult Session": "strategy_session",
  "60-Min Single Tutoring Session": "tutoring_session",
  "Legacy Student | 60-Min Tutoring": "tutoring_session",
};

type CalendlyResource = Record<string, unknown>;

const corsHeaders = (request: Request) => ({
  "Access-Control-Allow-Origin": allowedOrigins.has(request.headers.get("Origin") ?? "")
    ? request.headers.get("Origin")!
    : "https://portal.studywithmadison.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
});

const json = (request: Request, body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders(request) });

function asObject(value: unknown): CalendlyResource {
  return value && typeof value === "object" && !Array.isArray(value) ? value as CalendlyResource : {};
}

async function calendlyGet(path: string, token: string): Promise<CalendlyResource> {
  const response = await fetch(`${apiBase}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!response.ok) {
    console.error("Calendly API request failed", response.status);
    throw new Error(response.status === 401 || response.status === 403
      ? "Calendly rejected the API token. Check that it is valid and has event read access."
      : `Calendly could not return scheduled events (HTTP ${response.status}).`);
  }
  return asObject(await response.json());
}

async function getPages(path: string, token: string): Promise<CalendlyResource[]> {
  const resources: CalendlyResource[] = [];
  let nextPath: string | null = path;
  let pages = 0;
  while (nextPath) {
    if (++pages > 20) throw new Error("Calendly returned too many pages to import safely.");
    const result = await calendlyGet(nextPath, token);
    const items = Array.isArray(result.collection) ? result.collection : [];
    resources.push(...items.map(asObject));
    const pagination = asObject(result.pagination);
    const pageToken = typeof pagination.next_page_token === "string" ? pagination.next_page_token : "";
    if (!pageToken) {
      nextPath = null;
    } else {
      const separator = path.includes("?") ? "&" : "?";
      const basePath = path.split("&page_token=")[0];
      nextPath = `${basePath}${separator}page_token=${encodeURIComponent(pageToken)}`;
    }
  }
  return resources;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "Method not allowed." }, 405);

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return json(request, { error: "Sign in as an admin to import Calendly appointments." }, 401);
  }

  const projectUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const publishableKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const calendlyToken = Deno.env.get("CALENDLY_API_TOKEN") ?? "";
  if (!projectUrl || !publishableKey || !serviceRoleKey) {
    return json(request, { error: "Server configuration is incomplete." }, 500);
  }
  if (!calendlyToken) {
    return json(request, { error: "Calendly import is not configured. Add CALENDLY_API_TOKEN as a Supabase Function secret." }, 503);
  }

  const caller = createClient(projectUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: userData, error: userError } = await caller.auth.getUser();
  if (userError || !userData.user) {
    return json(request, { error: "Your admin session has expired. Sign in again and retry." }, 401);
  }

  const admin = createClient(projectUrl, serviceRoleKey);
  const { data: adminRecord, error: adminError } = await admin
    .from("app_admins")
    .select("user_id")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (adminError || !adminRecord) {
    return json(request, { error: "Only an admin can import Calendly appointments." }, 403);
  }

  try {
    const me = await calendlyGet("/users/me", calendlyToken);
    const userUri = String(asObject(me.resource).uri ?? "");
    if (!userUri) throw new Error("Calendly did not return the account’s user URI.");

    const now = new Date();
    const minStart = now.toISOString();
    const maxStart = new Date(now.getTime() + 62 * DAY_MS).toISOString();
    const params = new URLSearchParams({
      user: userUri,
      min_start_time: minStart,
      max_start_time: maxStart,
      status: "active",
      count: "100",
    });
    const events = await getPages(`/scheduled_events?${params}`, calendlyToken);
    let imported = 0;
    let skipped = 0;

    for (const event of events) {
      const eventName = String(event.name ?? "").trim();
      const consultType = EVENT_TYPES[eventName];
      if (!consultType) {
        skipped++;
        continue;
      }

      const eventUri = String(event.uri ?? "");
      const eventId = eventUri.split("/").pop();
      if (!eventId) throw new Error("Calendly returned a scheduled event without an ID.");
      const invitees = await getPages(`/scheduled_events/${encodeURIComponent(eventId)}/invitees?status=active&count=100`, calendlyToken);

      for (const invitee of invitees) {
        const inviteeUri = String(invitee.uri ?? "");
        if (!inviteeUri) throw new Error("Calendly returned an invitee without a URI.");
        const { data: existing, error: existingError } = await admin
          .from("consultations")
          .select("id,status")
          .eq("calendly_invitee_uri", inviteeUri)
          .maybeSingle();
        if (existingError) throw new Error("Could not check existing Calendly appointments before import.");
        if (existing?.status === "scheduled") {
          skipped++;
          continue;
        }
        const payload = {
          uri: inviteeUri,
          name: String(invitee.name ?? ""),
          email: String(invitee.email ?? ""),
          timezone: String(invitee.timezone ?? ""),
          text_reminder_number: invitee.text_reminder_number ?? null,
          questions_and_answers: Array.isArray(invitee.questions_and_answers) ? invitee.questions_and_answers : [],
          created_at: invitee.created_at ?? null,
          updated_at: invitee.updated_at ?? null,
          scheduled_event: {
            uri: eventUri,
            name: eventName,
            event_type: event.event_type ?? null,
            start_time: event.start_time ?? null,
            end_time: event.end_time ?? null,
          },
        };
        const deliveryKey = `backfill:${inviteeUri}`;
        const { data, error } = await admin.rpc("process_calendly_event", {
          p_event: "invitee.created",
          p_payload: payload,
          p_delivery_key: deliveryKey,
          p_consult_type: consultType,
        });
        if (error) {
          console.error("Calendly booking import failed", error.message);
          throw new Error("A Calendly appointment could not be saved. Retry the import; existing bookings are preserved.");
        }
        if (asObject(data).action === "duplicate_delivery") skipped++;
        else imported++;
      }
    }

    return json(request, { ok: true, imported, skipped, range_end: maxStart });
  } catch (error) {
    console.error("Calendly appointment import failed", error instanceof Error ? error.message : "Unknown error");
    return json(request, { error: error instanceof Error ? error.message : "Calendly appointments could not be imported." }, 502);
  }
});
