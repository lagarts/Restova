import { createClient } from "@supabase/supabase-js";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
let page = 1, total = 0;
while (page) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
  if (error) { console.error("ERR", error.message); process.exit(1); }
  for (const u of data.users) {
    total++;
    console.log([
      u.email,
      "created=" + (u.created_at || "").slice(0, 19),
      "confirmed=" + (u.email_confirmed_at ? u.email_confirmed_at.slice(0, 19) : "NO"),
      "last=" + (u.last_sign_in_at || "-").slice(0, 19),
      "banned=" + (u.banned_until || "-"),
    ].join(" | "));
  }
  page = data.users.length === 100 ? page + 1 : 0;
}
console.log("TOTAL=" + total);
