"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireOrgContext } from "@/lib/tenant/require";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/auth/rbac";
import { BRANCH_COOKIE } from "@/lib/tenant/context";
import { firstIssue } from "@/lib/validation/common";
import { branchSchema, organizationSchema } from "@/lib/validation/org";
import { mapRpcError } from "@/lib/supabase/rpc-error";

export type ActionResult = { ok: true } | { ok: false; error: string };

function revalidateSettings() {
  revalidatePath("/", "layout");
}

export async function updateOrganization(formData: FormData): Promise<ActionResult> {
  const context = await requireOrgContext();
  if (!can(context.role, "org.manage")) return { ok: false, error: "Sin permisos." };

  const parsed = organizationSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email") ?? "",
    phone: formData.get("phone") ?? "",
    address: formData.get("address") ?? "",
    legal_name: formData.get("legal_name") ?? "",
    tax_id: formData.get("tax_id") ?? "",
  });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({
      name: parsed.data.name,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
      address: parsed.data.address || null,
      legal_name: parsed.data.legal_name || null,
      tax_id: parsed.data.tax_id || null,
    })
    .eq("id", context.orgId);

  if (error) return { ok: false, error: mapRpcError(error) };
  revalidateSettings();
  return { ok: true };
}

export async function saveBranch(
  branchId: string | null,
  formData: FormData
): Promise<ActionResult> {
  const context = await requireOrgContext();
  if (!can(context.role, "branch.manage")) return { ok: false, error: "Sin permisos." };

  const parsed = branchSchema.safeParse({
    name: formData.get("name"),
    address: formData.get("address") ?? "",
    phone: formData.get("phone") ?? "",
  });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const payload = {
    name: parsed.data.name,
    address: parsed.data.address || null,
    phone: parsed.data.phone || null,
  };

  if (branchId) {
    const { error } = await supabase
      .from("branches")
      .update(payload)
      .eq("id", branchId)
      .eq("org_id", context.orgId);
    if (error) return { ok: false, error: mapRpcError(error) };
  } else {
    const { error } = await supabase.from("branches").insert({
      org_id: context.orgId,
      ...payload,
    });
    if (error) return { ok: false, error: mapRpcError(error) };
  }

  revalidateSettings();
  return { ok: true };
}

export async function useBranch(branchId: string): Promise<ActionResult> {
  const context = await requireOrgContext();
  const branch = context.branches.find((candidate) => candidate.id === branchId);
  if (!branch) return { ok: false, error: "No encontramos esa sucursal." };

  const store = await cookies();
  store.set(BRANCH_COOKIE, branch.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidateSettings();
  return { ok: true };
}
