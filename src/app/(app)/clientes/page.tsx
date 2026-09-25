import { requireOrgContext } from "@/lib/tenant/require";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/auth/rbac";
import type { Customer } from "@/types/domain";
import ClientesView from "./clientes-view";

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const context = await requireOrgContext();
  const supabase = await createClient();

  const { q } = await searchParams;
  const term = (q ?? "").replace(/[^0-9a-zA-Z\s@.\-+()]/g, "").trim();

  let query = supabase
    .from("customers")
    .select("*")
    .eq("org_id", context.orgId)
    .is("deleted_at", null)
    .order("name")
    .limit(300);

  if (term) {
    query = query.or(`name.ilike.%${term}%,phone.ilike.%${term}%`);
  }

  const { data } = await query;

  return (
    <ClientesView
      customers={(data ?? []) as Customer[]}
      search={term}
      canManage={can(context.role, "customers.manage")}
      canDelete={can(context.role, "org.manage")}
    />
  );
}
