import { withSupabase } from 'jsr:@supabase/server@^1';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://madisondvahle-lab.github.io',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

const reply = (body: object, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

export default {
  fetch: withSupabase({ auth: 'none' }, async (request) => {
    if (request.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return reply({ error: 'Method not allowed.' }, 405);
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
        return reply({ error: 'Please complete the form and security check.' }, 400);
      }

      const secret = Deno.env.get('TURNSTILE_SECRET_KEY');
      if (!secret) {
        return reply({ error: 'Security is not configured yet.' }, 503);
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
        return reply({ error: 'Please refresh the security check and try again.' }, 403);
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

      return reply({ readinessBand });
    } catch (error) {
      console.error(error);
      return reply({ error: 'We could not save your diagnostic right now.' }, 500);
    }
  }),
};
