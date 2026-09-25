import { requireOrgContext } from "@/lib/tenant/require";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/auth/rbac";
import type { Category, Product } from "@/types/domain";
import ProductosView from "./productos-view";

export default async function ProductosPage() {
  const context = await requireOrgContext();
  const supabase = await createClient();

  const [categoriesResult, productsResult] = await Promise.all([
    supabase
      .from("categories")
      .select("*")
      .eq("branch_id", context.branchId)
      .is("deleted_at", null)
      .order("sort_order")
      .order("name"),
    supabase
      .from("products")
      .select("*")
      .eq("branch_id", context.branchId)
      .is("deleted_at", null)
      .order("sort_order")
      .order("name"),
  ]);

  return (
    <ProductosView
      categories={(categoriesResult.data ?? []) as Category[]}
      products={(productsResult.data ?? []) as Product[]}
      canManage={can(context.role, "catalog.manage")}
    />
  );
}
