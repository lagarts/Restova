import { createClient } from "@supabase/supabase-js";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
let page = 1, deleted = 0;
while (page) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
  if (error) { console.error("list:", error.message); process.exit(1); }
  for (const u of data.users) {
    if (u.email && u.email.startsWith("e2e-") && u.email.endsWith("@example.com")) {
      const { error: delErr } = await admin.auth.admin.deleteUser(u.id);
      console.log(delErr ? `ERR ${u.email}: ${delErr.message}` : `deleted ${u.email}`);
      if (!delErr) deleted++;
    }
  }
  page = data.users.length === 100 ? page + 1 : 0;
}
const { data: after } = await admin.auth.admin.listUsers({ page: 1, perPage: 100 });
console.log(`deleted=${deleted} remaining=${after.users.length}: ${after.users.map((u) => u.email).join(", ")}`);
