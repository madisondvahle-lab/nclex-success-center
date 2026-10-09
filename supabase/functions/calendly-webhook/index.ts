import { createClient } from "npm:@supabase/supabase-js@2";

// Receives Calendly webhooks. Authenticity comes from Calendly's HMAC signature,
// so this function is deployed with --no-verify-jwt. Secrets live only in
// Supabase function secrets: CALENDLY_WEBHOOK_SIGNING_KEY (required) and
// CALENDLY_CONSULT_EVENT_TYPE_URI (optional; restricts to the free consultation).

const encoder = new TextEncoder();
const TOLERANCE_SECONDS = 180;

const respond = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const timingSafeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

async function hmacHex(key: string, message: string) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw", encoder.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
  return Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifySignature(header: string | null, body: string, signingKey: string) {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((part) => {
      const [k, ...rest] = part.trim().split("=");
      return [k, rest.join("=")];
    }),
  );
  const timestamp = parts["t"];
  const signature = parts["v1"];
  if (!timestamp || !signature) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > TOLERANCE_SECONDS) return false;
  const expected = await hmacHex(signingKey, `${timestamp}.${body}`);
  return timingSafeEqual(expected, signature);
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return respond({ error: "Method not allowed." }, 405);

  const signingKey = Deno.env.get("CALENDLY_WEBHOOK_SIGNING_KEY") ?? "";
  const projectUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!signingKey || !projectUrl || !serviceRoleKey) {
    return respond({ error: "Server configuration is incomplete." }, 500);
  }

  const body = await request.text();
  if (!(await verifySignature(request.headers.get("Calendly-Webhook-Signature"), body, signingKey))) {
    return respond({ error: "Invalid signature." }, 401);
  }

  let event: { event?: string; payload?: Record<string, any> };
  try {
    event = JSON.parse(body);
  } catch {
    return respond({ error: "Invalid JSON." }, 400);
  }

  const type = event.event ?? "";
  const payload = event.payload ?? {};
  if (type !== "invitee.created" && type !== "invitee.canceled") {
    return respond({ ok: true, action: "ignored_event" });
  }

  const scheduled = payload.scheduled_event ?? {};
  const requiredType = Deno.env.get("CALENDLY_CONSULT_EVENT_TYPE_URI") ?? "";
  const isConsult = requiredType
    ? scheduled.event_type === requiredType
    : /free.*consult|consult.*free|15.*consult/i.test(String(scheduled.name ?? ""));
  if (!isConsult) return respond({ ok: true, action: "ignored_event_type" });

  const deliveryKey = `${type}:${payload.uri}:${scheduled.start_time ?? ""}:${payload.updated_at ?? payload.created_at ?? ""}`;
  const admin = createClient(projectUrl, serviceRoleKey);
  const { data, error } = await admin.rpc("process_calendly_event", {
    p_event: type,
    p_payload: payload,
    p_delivery_key: deliveryKey,
  });

  if (error) {
    console.error("process_calendly_event failed", error.message);
    // Non-2xx makes Calendly retry the delivery.
    return respond({ error: "Could not record booking." }, 500);
  }
  return respond(data ?? { ok: true });
});
