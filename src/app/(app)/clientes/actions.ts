"use server";

import { revalidatePath } from "next/cache";
import { requireOrgContext } from "@/lib/tenant/require";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/auth/rbac";
import { firstIssue } from "@/lib/validation/common";
import { customerSchema } from "@/lib/validation/crm";
import { mapRpcError } from "@/lib/supabase/rpc-error";

export type ActionResult = { ok: true } | { ok: false; error: string };

function revalidateCustomers() {
  revalidatePath("/clientes");
  revalidatePath("/dashboard");
}

export async function saveCustomer(
  customerId: string | null,
  formData: FormData
): Promise<ActionResult> {
  const context = await requireOrgContext();
  if (!can(context.role, "customers.manage")) return { ok: false, error: "Sin permisos." };

  const parsed = customerSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone") ?? "",
    email: formData.get("email") ?? "",
    address: formData.get("address") ?? "",
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const payload = {
    name: parsed.data.name,
    phone: parsed.data.phone || null,
    email: parsed.data.email || null,
    address: parsed.data.address || null,
    notes: parsed.data.notes || null,
  };

  const supabase = await createClient();

  if (customerId) {
    const { error } = await supabase
      .from("customers")
      .update(payload)
      .eq("id", customerId)
      .eq("org_id", context.orgId);
    if (error) return { ok: false, error: mapRpcError(error) };
  } else {
    const { error } = await supabase.from("customers").insert({
      org_id: context.orgId,
      ...payload,
    });
    if (error) {
      if (error.code === "23505") return { ok: false, error: "Ya existe un cliente con ese teléfono." };
      return { ok: false, error: mapRpcError(error) };
    }
  }

  revalidateCustomers();
  return { ok: true };
}

export async function deleteCustomer(customerId: string): Promise<ActionResult> {
  const context = await requireOrgContext();
  if (!can(context.role, "org.manage")) return { ok: false, error: "Sin permisos." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("customers")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", customerId)
    .eq("org_id", context.orgId);

  if (error) return { ok: false, error: mapRpcError(error) };
  revalidateCustomers();
  return { ok: true };
}
