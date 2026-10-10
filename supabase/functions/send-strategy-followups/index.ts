import { createClient } from "npm:@supabase/supabase-js@2";

// Sends the automatic NCLEX Strategy Session follow-up (and one reminder) through
// Resend. Called every 15 minutes by pg_cron with the x-cron-secret header, or by
// a signed-in admin (Authorization header) to send a test email to themselves.
// Secrets: RESEND_API_KEY, CRON_SECRET (function secrets, never in code).

const FROM = "Study With Madison RN <support@studywithmadison.com>";
const MAX_AGE_DAYS = 3;
const MS_DAY = 86_400_000;

const CORS = {
  "Access-Control-Allow-Origin": "https://portal.studywithmadison.com",
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });
const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

type Link = { label: string; url: string };
type Settings = {
  send_mode: string; preview_email: string | null; package_links: Link[];
  credit_amount: number; credit_days: number; reminder_days: number; active_since: string;
};

function fmtDate(iso: string, tz?: string | null) {
  const opts: Intl.DateTimeFormatOptions = { weekday: "long", month: "long", day: "numeric" };
  try { return new Intl.DateTimeFormat("en-US", { ...opts, timeZone: tz || "America/Chicago" }).format(new Date(iso)); }
  catch { return new Intl.DateTimeFormat("en-US", opts).format(new Date(iso)); }
}

function buildEmail(kind: "followup" | "reminder", name: string, deadline: string, s: Settings) {
  const first = (name || "there").split(" ")[0];
  const amount = `$${s.credit_amount}`;
  const intro = kind === "followup"
    ? `Thank you for your NCLEX Strategy Session. I enjoyed working through your question patterns with you.`
    : `Just a quick reminder about the ${amount} credit from your NCLEX Strategy Session.`;
  const body = `If you decide to continue with tutoring, purchase any tutoring package by ${deadline} and I will refund your ${amount} Strategy Session fee to your original payment method.`;
  const how = `After you purchase, just reply to this email and I'll take care of the refund.`;
  const closing = `There is no pressure to commit. If you have questions, reply any time.`;
  const text = [`Hi ${first},`, "", intro, "", body, how, "", closing, "", "Madison", "Study With Madison, RN"].join("\n");
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.55;color:#1f2933;max-width:560px">
<p>Hi ${esc(first)},</p><p>${esc(intro)}</p><p>${esc(body)} ${esc(how)}</p>
<p>${esc(closing)}</p><p>Madison<br>Study With Madison, RN</p></div>`;
  return { subject: kind === "followup" ? `Your ${amount} package credit from your Strategy Session` : `Reminder: your ${amount} package credit ends ${deadline}`, text, html };
}

async function sendEmail(apiKey: string, to: string, subject: string, text: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], reply_to: "support@studywithmadison.com", subject, text, html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const cronSecret = Deno.env.get("CRON_SECRET");
  const provided = req.headers.get("x-cron-secret");
  const isCron = !!cronSecret && !!provided && safeEqual(provided, cronSecret);

  const { data: settings } = await admin.from("followup_settings").select("*").eq("id", 1).single();
  if (!settings) return json({ error: "settings missing" }, 500);
  const s = settings as Settings;

  // Admin-only test send: signed-in admin gets a sample email at their preview address.
  if (!isCron) {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer /, "");
    const { data: userData } = token ? await admin.auth.getUser(token) : { data: { user: null } };
    const user = userData?.user;
    if (!user) return json({ error: "unauthorized" }, 401);
    const { data: isAdmin } = await admin.from("app_admins").select("user_id").eq("user_id", user.id).maybeSingle();
    if (!isAdmin) return json({ error: "unauthorized" }, 403);
    if (!apiKey) return json({ error: "RESEND_API_KEY is not set yet" }, 400);
    const to = s.preview_email || user.email;
    if (!to) return json({ error: "No preview email set" }, 400);
    const mail = buildEmail("followup", "Sample Student", fmtDate(new Date(Date.now() + s.credit_days * MS_DAY).toISOString()), s);
    try { await sendEmail(apiKey, to, "[TEST] " + mail.subject, mail.text, mail.html); }
    catch (e) { return json({ error: String(e) }, 502); }
    return json({ ok: true, sent_to: to });
  }

  // Expire old credits regardless of mode.
  await admin.from("consultations").update({ credit_status: "expired" })
    .in("credit_status", ["link_sent", "reminded"]).lt("credit_expires_at", new Date().toISOString());

  if (s.send_mode === "off") return json({ ok: true, mode: "off" });
  if (!apiKey) return json({ ok: true, skipped: "RESEND_API_KEY not set" });

  const now = Date.now();
  const live = s.send_mode === "live";
  const since = new Date(Math.max(new Date(s.active_since).getTime(), now - MAX_AGE_DAYS * MS_DAY)).toISOString();
  const results: Record<string, number> = { followup: 0, reminder: 0, failed: 0 };

  const base = () => admin.from("consultations")
    .select("id, invitee_name, invitee_email, invitee_timezone, scheduled_start, scheduled_end, credit_expires_at")
    .eq("consult_type", "strategy_session").eq("followup_skip", false);

  const { data: due } = await base()
    .in("status", ["scheduled", "in_progress", "completed"])
    .is(live ? "followup_sent_at" : "followup_preview_sent_at", null)
    .lt("scheduled_end", new Date(now - 10 * 60_000).toISOString())
    .gte("scheduled_end", since).limit(25);

  for (const c of due || []) {
    const end = c.scheduled_end || c.scheduled_start;
    const deadline = fmtDate(new Date(new Date(end).getTime() + s.credit_days * MS_DAY).toISOString(), c.invitee_timezone);
    const mail = buildEmail("followup", c.invitee_name, deadline, s);
    const to = live ? c.invitee_email : s.preview_email;
    if (!to) continue;
    try {
      if (live) {
        const { data: claimed } = await admin.rpc("claim_followup", { p_id: c.id, p_kind: "followup" });
        if (!claimed) continue;
        try { await sendEmail(apiKey, to, mail.subject, mail.text, mail.html); }
        catch (e) { await admin.rpc("release_followup", { p_id: c.id, p_kind: "followup" }); throw e; }
        await admin.from("consultation_events").insert({ consultation_id: c.id, event_type: "followup_email_sent", details: {} });
      } else {
        const { data: marked } = await admin.from("consultations").update({ followup_preview_sent_at: new Date().toISOString() })
          .eq("id", c.id).is("followup_preview_sent_at", null).select("id");
        if (!marked?.length) continue;
        await sendEmail(apiKey, to, `[PREVIEW for ${c.invitee_email}] ${mail.subject}`, mail.text, mail.html);
      }
      results.followup++;
    } catch (e) { console.error("followup failed", c.id, String(e)); results.failed++; }
  }

  const reminderCutoff = new Date(now - s.reminder_days * MS_DAY).toISOString();
  let rq = base().lt("scheduled_end", reminderCutoff).gte("scheduled_end", new Date(now - 30 * MS_DAY).toISOString());
  rq = live
    ? rq.eq("credit_status", "link_sent").is("reminder_sent_at", null).gt("credit_expires_at", new Date(now).toISOString())
    : rq.is("reminder_preview_sent_at", null).gte("scheduled_end", s.active_since).in("status", ["scheduled", "in_progress", "completed"]);
  const { data: reminders } = await rq.limit(25);

  for (const c of reminders || []) {
    const end = c.scheduled_end || c.scheduled_start;
    const deadline = fmtDate(new Date(new Date(end).getTime() + s.credit_days * MS_DAY).toISOString(), c.invitee_timezone);
    const mail = buildEmail("reminder", c.invitee_name, deadline, s);
    const to = live ? c.invitee_email : s.preview_email;
    if (!to) continue;
    try {
      if (live) {
        const { data: claimed } = await admin.rpc("claim_followup", { p_id: c.id, p_kind: "reminder" });
        if (!claimed) continue;
        try { await sendEmail(apiKey, to, mail.subject, mail.text, mail.html); }
        catch (e) { await admin.rpc("release_followup", { p_id: c.id, p_kind: "reminder" }); throw e; }
        await admin.from("consultation_events").insert({ consultation_id: c.id, event_type: "credit_reminder_sent", details: {} });
      } else {
        const { data: marked } = await admin.from("consultations").update({ reminder_preview_sent_at: new Date().toISOString() })
          .eq("id", c.id).is("reminder_preview_sent_at", null).select("id");
        if (!marked?.length) continue;
        await sendEmail(apiKey, to, `[PREVIEW REMINDER for ${c.invitee_email}] ${mail.subject}`, mail.text, mail.html);
      }
      results.reminder++;
    } catch (e) { console.error("reminder failed", c.id, String(e)); results.failed++; }
  }

  return json({ ok: true, mode: s.send_mode, ...results });
});
