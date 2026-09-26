import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const email = `login-probe-${Date.now()}@example.com`;
const password = "Probe-Passw0rd!123";

const { data: created, error: createErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (createErr) { console.error("create ERR", createErr.message); process.exit(1); }
console.log("usuario creado:", email, "confirmed=", created.user.email_confirmed_at ? "SI" : "NO");

// mismo endpoint que usa signInWithPassword
const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: anon, "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});
const body = await res.json();
console.log("login HTTP", res.status, res.status === 200 ? `access_token len=${(body.access_token || "").length} user=${body.user?.email}` : JSON.stringify(body));

// password incorrecto -> debe dar invalid_credentials
const bad = await fetch(`${url}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: anon, "Content-Type": "application/json" },
  body: JSON.stringify({ email, password: "wrong-password" }),
});
const badBody = await bad.json();
console.log("login mal HTTP", bad.status, JSON.stringify({ code: badBody.error_code || badBody.error, msg: badBody.msg || badBody.error_description }));

await admin.auth.admin.deleteUser(created.user.id);
console.log("usuario de prueba eliminado");
