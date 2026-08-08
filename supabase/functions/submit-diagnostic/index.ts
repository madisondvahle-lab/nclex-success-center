import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://madisondvahle-lab.github.io',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  try {
    const body = await request.json();
    const name = String(body.fullName ?? '').trim();
    const email = String(body.email ?? '').trim().toLowerCase();
    const consent = body.consentToContact === true;
    const score = Number(body.overallScore);
    const categoryScores = body.categoryScores ?? {};

    if (name.length < 2 || !email.includes('@') || !consent || !Number.isFinite(score)) {
      return json({ error: 'Please complete your name, email, and consent before viewing results.' }, 400);
    }

    // Add Cloudflare Turnstile validation here before launch. Keep the secret in Supabase secrets.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const readinessBand = score < 45 ? 'building_foundation' : score < 65 ? 'developing' : score < 80 ? 'on_track' : 'strong';
    const { error } = await supabase.from('diagnostic_leads').insert({
      full_name: name,
      email,
      nclex_target_date: body.nclexTargetDate || null,
      overall_score: score,
      category_scores: categoryScores,
      readiness_band: readinessBand,
      consent_to_contact: true,
    });
    if (error) throw error;

    // Add Resend (or another transactional-email provider) here to send Madison a lead alert.
    return json({ readinessBand });
  } catch (error) {
    console.error(error);
    return json({ error: 'We could not save your diagnostic right now. Please try again.' }, 500);
  }
});
