import { withSupabase } from 'jsr:@supabase/server@^1';
import { createClient } from 'npm:@supabase/supabase-js@2';

const allowedOrigins = new Set([
  'https://portal.studywithmadison.com',
  'https://madisondvahle-lab.github.io',
]);

const corsHeaders = (request: Request) => {
  const origin = request.headers.get('Origin') ?? '';
  const allowedOrigin = allowedOrigins.has(origin)
    ? origin
    : 'https://portal.studywithmadison.com';

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    'Vary': 'Origin',
  };
};

const reply = (request: Request, body: object, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders(request) });

export default {
  fetch: withSupabase({ auth: 'none' }, async (request) => {
    if (request.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders(request) });
    }

    if (request.method !== 'POST') {
      return reply(request, { error: 'Method not allowed.' }, 405);
    }

    const origin = request.headers.get('Origin') ?? '';
    if (origin && !allowedOrigins.has(origin)) {
      return reply(request, { error: 'Origin not allowed.' }, 403);
    }

    try {
      const body = await request.json();
      const name = String(body.fullName ?? '').trim();
      const email = String(body.email ?? '').trim().toLowerCase();
      const score = Number(body.overallScore);
      const token = String(body.turnstileToken ?? '');

      if (
        name.length < 2 ||
        !email.includes('@') ||
        body.consentToContact !== true ||
        !Number.isFinite(score) ||
        !token
      ) {
        return reply(request, { error: 'Please complete the form and security check.' }, 400);
      }

      const secret = Deno.env.get('TURNSTILE_SECRET_KEY');
      if (!secret) {
        return reply(request, { error: 'Security is not configured yet.' }, 503);
      }

      const verifyResponse = await fetch(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ secret, response: token }),
        },
      );

      const verification = await verifyResponse.json();
      if (!verifyResponse.ok || verification.success !== true) {
        return reply(request, { error: 'Please refresh the security check and try again.' }, 403);
      }

      let readinessBand = 'strong';
      if (score < 45) readinessBand = 'building_foundation';
      else if (score < 65) readinessBand = 'developing';
      else if (score < 80) readinessBand = 'on_track';

      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      );

      const { error } = await supabase.from('diagnostic_leads').insert({
        full_name: name,
        email,
        nclex_target_date: body.nclexTargetDate || null,
        overall_score: score,
        category_scores: body.categoryScores ?? {},
        readiness_band: readinessBand,
        consent_to_contact: true,
      });

      if (error) throw error;

      return reply(request, { readinessBand });
    } catch (error) {
      console.error(error);
      return reply(request, { error: 'We could not save your diagnostic right now.' }, 500);
    }
  }),
};
