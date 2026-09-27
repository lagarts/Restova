import { createClient } from "@supabase/supabase-js";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 100 });
if (error) { console.error('LIST_ERR', error.status, error.message); process.exit(1); }
const users = data.users;
for (const u of users) {
  console.log(`USER ${u.email} id=${u.id} confirmed=${u.email_confirmed_at ? "SI" : "NO"}`);

  const { data: profile } = await admin.from("profiles").select("full_name, created_at").eq("id", u.id).maybeSingle();
  console.log(`  profile: ${profile ? profile.full_name : "<SIN PERFIL>"}`);

  const { data: members } = await admin.from("org_members").select("org_id, role, active, created_at").eq("user_id", u.id);
  console.log(`  membresias: ${members?.length ?? 0}`);
  for (const m of members ?? []) {
    const { data: org } = await admin.from("organizations").select("name, slug, created_at").eq("id", m.org_id).maybeSingle();
    const { data: subs } = await admin.from("subscriptions").select("status, trial_end").eq("org_id", m.org_id).maybeSingle();
    console.log(`    org=${org?.name} (${org?.slug}) rol=${m.role} active=${m.active} status=${subs?.status} trial_end=${subs?.trial_end}`);
    const { data: branches } = await admin.from("branches").select("name, is_main").eq("org_id", m.org_id);
    console.log(`    sucursales: ${branches?.map((b) => b.name + (b.is_main ? "*" : "")).join(", ") || "<NINGUNA>"}`);
    const { count: tables } = await admin.from("dining_tables").select("id", { count: "exact", head: true }).eq("org_id", m.org_id);
    const { count: products } = await admin.from("products").select("id", { count: "exact", head: true }).eq("org_id", m.org_id);
    console.log(`    mesas=${tables} productos=${products}`);
  }
}
