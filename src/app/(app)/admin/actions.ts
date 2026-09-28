"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlatformAdmin } from "@/lib/auth/platform-admin";
import { getOrgContext } from "@/lib/tenant/context";
import { firstIssue } from "@/lib/validation/common";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

const orgIdSchema = z.string().uuid({ message: "Organización inválida." });

type GuardResult = { orgId: string; admin: ReturnType<typeof createAdminClient> } | { error: string };

async function guard(orgIdInput: unknown, options: { allowSelf?: boolean } = {}): Promise<GuardResult> {
  if (!(await isPlatformAdmin())) return { error: "Sin permisos." };

  const parsed = orgIdSchema.safeParse(orgIdInput);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  if (!options.allowSelf) {
    const context = await getOrgContext();
    if (context && context.orgId === parsed.data) {
      return { error: "No podés eliminar tu propia organización." };
    }
  }

  try {
    return { orgId: parsed.data, admin: createAdminClient() };
  } catch {
    return { error: "Falta la clave de servicio en el servidor." };
  }
}

/** Marks the tenant subscription as permanent and free of charge. */
export async function grantFreeForever(orgId: unknown): Promise<ActionResult> {
  const access = await guard(orgId, { allowSelf: true });
  if ("error" in access) return { ok: false, error: access.error };

  const now = new Date().toISOString();
  const { data, error } = await access.admin
    .from("subscriptions")
    .update({
      status: "active",
      plan: "gratis",
      current_period_start: now,
      current_period_end: null,
      cancel_at_period_end: false,
      updated_at: now,
    })
    .eq("org_id", access.orgId)
    .select("id");

  if (error) return { ok: false, error: "No pudimos actualizar la suscripción." };
  if (!data || data.length === 0) return { ok: false, error: "Esa organización no tiene suscripción." };

  revalidatePath("/admin");
  return { ok: true };
}

/** Removes the tenant, its data and the accounts that only belong to it. */
export async function deleteOrganization(orgId: unknown): Promise<ActionResult> {
  const access = await guard(orgId);
  if ("error" in access) return { ok: false, error: access.error };

  const { admin, orgId: id } = access;

  const { data: memberRows, error: memberError } = await admin
    .from("org_members")
    .select("user_id")
    .eq("org_id", id);
  if (memberError) return { ok: false, error: "No pudimos leer los miembros de la organización." };

  const memberIds = [...new Set((memberRows ?? []).map((row) => row.user_id))];

  const soloAccountIds: string[] = [];
  if (memberIds.length > 0) {
    const { data: allMemberships } = await admin
      .from("org_members")
      .select("user_id, org_id")
      .in("user_id", memberIds);

    const perUser = new Map<string, number>();
    const belongsElsewhere = new Set<string>();
    for (const row of (allMemberships ?? []) as { user_id: string; org_id: string }[]) {
      perUser.set(row.user_id, (perUser.get(row.user_id) ?? 0) + 1);
      if (row.org_id !== id) belongsElsewhere.add(row.user_id);
    }
    for (const userId of memberIds) {
      if ((perUser.get(userId) ?? 0) === 1 && !belongsElsewhere.has(userId)) soloAccountIds.push(userId);
    }
  }

  const { error: deleteError } = await admin.from("organizations").delete().eq("id", id);
  if (deleteError) return { ok: false, error: "No pudimos eliminar la organización." };

  for (const userId of soloAccountIds) {
    await admin.auth.admin.deleteUser(userId).catch(() => undefined);
  }

  revalidatePath("/admin");
  return { ok: true };
}
