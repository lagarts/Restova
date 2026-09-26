import { createClient } from "@supabase/supabase-js";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 100 });
for (const u of data.users) {
  if (u.email_confirmed_at) continue;
  const { error } = await admin.auth.admin.updateUserById(u.id, { email_confirm: true });
  console.log(`${u.email}: ${error ? "ERR " + error.message : "CONFIRMADO"}`);
}
const { data: after } = await admin.auth.admin.listUsers({ page: 1, perPage: 100 });
for (const u of after.users) console.log(`${u.email} confirmed=${u.email_confirmed_at ? "SI" : "NO"}`);
