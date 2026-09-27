import { createClient } from "@supabase/supabase-js";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: orgs, error } = await admin.from("organizations").select("*");
console.log("ERROR:", error ? `${error.code} ${error.message}` : "none");
for (const o of orgs ?? []) console.log("ORG:", JSON.stringify(o));

const { data: cols } = await admin.rpc("exec_sql", { sql: "select 1" }).limit(0).then(() => ({ data: null }));
void cols;
