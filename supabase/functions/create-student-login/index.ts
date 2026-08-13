import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://madisondvahle-lab.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return json({ error: "Sign in as an admin to create login access." }, 401);
  }

  const projectUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const publishableKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!projectUrl || !publishableKey || !serviceRoleKey) {
    return json({ error: "Server configuration is incomplete." }, 500);
  }

  const caller = createClient(projectUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: userData, error: userError } = await caller.auth.getUser();

  if (userError || !userData.user) {
    return json({ error: "Your admin session has expired. Please sign in again." }, 401);
  }

  const admin = createClient(projectUrl, serviceRoleKey);
  const { data: adminRecord, error: adminError } = await admin
    .from("app_admins")
    .select("user_id")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (adminError || !adminRecord) {
    return json({ error: "Only Madison's admin account can create student logins." }, 403);
  }

  let payload: { student_id?: string; password?: string };
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Please provide the student and a temporary password." }, 400);
  }

  const studentId = String(payload.student_id ?? "").trim();
  const password = String(payload.password ?? "");

  if (!studentId) {
    return json({ error: "Choose a student first." }, 400);
  }

  if (password.length < 8) {
    return json({ error: "Use a temporary password with at least 8 characters." }, 400);
  }

  const { data: student, error: studentError } = await admin
    .from("students")
    .select("id, name, email, auth_user_id")
    .eq("id", studentId)
    .maybeSingle();

  if (studentError || !student) {
    return json({ error: "That student profile could not be found." }, 404);
  }

  if (student.auth_user_id) {
    return json({ error: "This student already has portal access." }, 409);
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: student.email,
    password,
    email_confirm: true,
    user_metadata: { name: student.name, student_id: student.id },
  });

  if (createError || !created.user) {
    return json({ error: createError?.message ?? "The login account could not be created." }, 400);
  }

  const { error: linkError } = await admin
    .from("students")
    .update({ auth_user_id: created.user.id })
    .eq("id", student.id);

  if (linkError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return json({ error: "The account was not linked, so no login was created. Please try again." }, 500);
  }

  return json({
    ok: true,
    message: "Login access is ready.",
    email: student.email,
  });
});
