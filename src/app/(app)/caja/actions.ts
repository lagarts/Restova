"use server";

import { revalidatePath } from "next/cache";
import { requireOrgContext } from "@/lib/tenant/require";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/auth/rbac";
import { mapRpcError } from "@/lib/supabase/rpc-error";
import { firstIssue } from "@/lib/validation/common";
import { chargePayloadSchema, numberField } from "@/lib/validation/cash";

export type ActionResult = { ok: true; data?: unknown } | { ok: false; error: string };

function revalidateCash() {
  revalidatePath("/caja");
  revalidatePath("/dashboard");
  revalidatePath("/pedidos");
  revalidatePath("/mesas");
  revalidatePath("/ventas");
}

export async function openRegister(formData: FormData): Promise<ActionResult> {
  const context = await requireOrgContext();
  if (!can(context.role, "cash.open")) return { ok: false, error: "Sin permisos." };

  const amount = numberField.safeParse(formData.get("opening_amount") ?? "0");
  if (!amount.success) return { ok: false, error: firstIssue(amount.error) };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("open_cash_register", {
    _branch_id: context.branchId,
    _opening_amount: amount.data,
    _notes: formData.get("notes")?.toString() ?? null,
  });

  if (error) return { ok: false, error: mapRpcError(error) };
  revalidateCash();
  return { ok: true, data };
}

export async function closeRegister(formData: FormData): Promise<ActionResult> {
  const context = await requireOrgContext();
  if (!can(context.role, "cash.close")) return { ok: false, error: "Sin permisos." };

  const registerId = formData.get("register_id")?.toString();
  const declared = numberField.safeParse(formData.get("declared_amount") ?? "");
  if (!registerId) return { ok: false, error: "No encontramos la caja." };
  if (!declared.success) return { ok: false, error: firstIssue(declared.error) };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("close_cash_register", {
    _register_id: registerId,
    _declared_amount: declared.data,
    _notes: formData.get("notes")?.toString() ?? null,
  });

  if (error) return { ok: false, error: mapRpcError(error) };
  revalidateCash();
  return { ok: true, data };
}

export async function chargeSession(
  sessionId: string,
  payload: { payments: unknown[]; discount_amount?: number }
): Promise<ActionResult> {
  const context = await requireOrgContext();
  if (!can(context.role, "orders.charge") && !can(context.role, "cash.view")) {
    return { ok: false, error: "Sin permisos." };
  }
  if (!context.canOperate) return { ok: false, error: "La suscripción no está activa." };

  const parsed = chargePayloadSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("charge_session", {
    _session_id: sessionId,
    _payments: parsed.data.payments,
    _discount_amount: parsed.data.discount_amount,
  });

  if (error) return { ok: false, error: mapRpcError(error) };
  revalidateCash();
  return { ok: true, data };
}
