"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { requireOrgContext } from "@/lib/tenant/require";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { can } from "@/lib/auth/rbac";
import { mapRpcError } from "@/lib/supabase/rpc-error";
import { firstIssue } from "@/lib/validation/common";
import { inviteSchema } from "@/lib/validation/users";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

function revalidateUsers() {
  revalidatePath("/usuarios");
}

function generatePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$";
  const bytes = randomBytes(16);
  let output = "";
  for (const byte of bytes) output += alphabet[byte % alphabet.length];
  return output;
}

export async function inviteMember(
  formData: FormData
): Promise<ActionResult<{ password?: string }>> {
  const context = await requireOrgContext();
  if (!can(context.role, "users.manage")) return { ok: false, error: "Sin permisos." };

  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    full_name: formData.get("full_name"),
    role: formData.get("role"),
    phone: formData.get("phone") ?? "",
  });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const email = parsed.data.email.toLowerCase();

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, error: "Falta la clave de servicio en el servidor." };
  }

  let userId: string | null = null;
  let page = 1;
  while (page <= 25) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return { ok: false, error: mapRpcError(error) };

    const match = data.users.find((user) => user.email?.toLowerCase() === email);
    if (match) userId = match.id;
    if (userId || data.users.length < 200) break;
    page += 1;
  }

  let password: string | undefined;

  if (!userId) {
    password = generatePassword();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: parsed.data.full_name,
        phone: parsed.data.phone || "",
      },
    });
    if (error) return { ok: false, error: mapRpcError(error) };
    userId = data.user.id;
  }

  const supabase = await createClient();
  const { error: memberError } = await supabase.from("org_members").insert({
    org_id: context.orgId,
    user_id: userId,
    role: parsed.data.role,
    branch_id: context.branchId,
  });

  if (memberError) {
    if (memberError.code === "23505") {
      return { ok: false, error: "Esa persona ya pertenece al negocio." };
    }
    return { ok: false, error: mapRpcError(memberError) };
  }

  revalidateUsers();
  return { ok: true, data: password ? { password } : {} };
}

export async function updateMemberRole(
  memberId: string,
  role: string
): Promise<ActionResult> {
  const context = await requireOrgContext();
  if (!can(context.role, "users.manage")) return { ok: false, error: "Sin permisos." };

  const supabase = await createClient();

  const { data: current } = await supabase
    .from("org_members")
    .select("id, user_id, role")
    .eq("id", memberId)
    .eq("org_id", context.orgId)
    .maybeSingle();

  if (!current) return { ok: false, error: "No encontramos al usuario." };

  if (current.role === "admin" && role !== "admin") {
    const { count } = await supabase
      .from("org_members")
      .select("id", { count: "exact", head: true })
      .eq("org_id", context.orgId)
      .eq("role", "admin")
      .eq("active", true);

    if ((count ?? 0) <= 1) {
      return { ok: false, error: "No podés quitar el último administrador." };
    }
  }

  const { error } = await supabase
    .from("org_members")
    .update({ role })
    .eq("id", memberId)
    .eq("org_id", context.orgId);

  if (error) return { ok: false, error: mapRpcError(error) };
  revalidateUsers();
  return { ok: true };
}

export async function setMemberActive(
  memberId: string,
  active: boolean
): Promise<ActionResult> {
  const context = await requireOrgContext();
  if (!can(context.role, "users.manage")) return { ok: false, error: "Sin permisos." };

  const supabase = await createClient();

  const { data: current } = await supabase
    .from("org_members")
    .select("id, user_id, role")
    .eq("id", memberId)
    .eq("org_id", context.orgId)
    .maybeSingle();

  if (!current) return { ok: false, error: "No encontramos al usuario." };
  if (current.user_id === context.userId && !active) {
    return { ok: false, error: "No podés desactivarte a vos mismo." };
  }

  const { error } = await supabase
    .from("org_members")
    .update({ active })
    .eq("id", memberId)
    .eq("org_id", context.orgId);

  if (error) return { ok: false, error: mapRpcError(error) };
  revalidateUsers();
  return { ok: true };
}

export async function removeMember(memberId: string): Promise<ActionResult> {
  const context = await requireOrgContext();
  if (!can(context.role, "users.manage")) return { ok: false, error: "Sin permisos." };

  const supabase = await createClient();

  const { data: current } = await supabase
    .from("org_members")
    .select("id, user_id, role")
    .eq("id", memberId)
    .eq("org_id", context.orgId)
    .maybeSingle();

  if (!current) return { ok: false, error: "No encontramos al usuario." };
  if (current.user_id === context.userId) {
    return { ok: false, error: "No podés eliminarte a vos mismo." };
  }

  if (current.role === "admin") {
    const { count } = await supabase
      .from("org_members")
      .select("id", { count: "exact", head: true })
      .eq("org_id", context.orgId)
      .eq("role", "admin")
      .eq("active", true);

    if ((count ?? 0) <= 1) {
      return { ok: false, error: "No podés eliminar el último administrador." };
    }
  }

  const { error } = await supabase
    .from("org_members")
    .delete()
    .eq("id", memberId)
    .eq("org_id", context.orgId);

  if (error) return { ok: false, error: mapRpcError(error) };
  revalidateUsers();
  return { ok: true };
}
