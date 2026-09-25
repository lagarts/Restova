"use server";

import { revalidatePath } from "next/cache";
import { requireOrgContext } from "@/lib/tenant/require";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/auth/rbac";
import { mapRpcError } from "@/lib/supabase/rpc-error";
import { firstOf } from "@/lib/utils/embed";
import { firstIssue } from "@/lib/validation/common";
import { orderItemSchema, orderPayloadSchema } from "@/lib/validation/orders";

export type ActionResult = { ok: true } | { ok: false; error: string };

function revalidateOrders() {
  revalidatePath("/pedidos");
  revalidatePath("/mesas");
  revalidatePath("/dashboard");
  revalidatePath("/cocina");
}

export async function startOrder(
  sessionId: string,
  payload: { items: unknown[]; notes?: string }
): Promise<ActionResult> {
  const context = await requireOrgContext();
  if (!can(context.role, "orders.create")) return { ok: false, error: "Sin permisos." };
  if (!context.canOperate) return { ok: false, error: "La suscripción no está activa." };

  const parsed = orderPayloadSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_order", {
    _table_session_id: sessionId,
    _items: parsed.data.items,
    _notes: parsed.data.notes ?? null,
  });

  if (error) return { ok: false, error: mapRpcError(error) };
  revalidateOrders();
  return { ok: true };
}

export async function addToOrder(
  orderId: string,
  payload: { items: unknown[] }
): Promise<ActionResult> {
  const context = await requireOrgContext();
  if (!can(context.role, "orders.create")) return { ok: false, error: "Sin permisos." };
  if (!context.canOperate) return { ok: false, error: "La suscripción no está activa." };

  const items = orderPayloadSchema.shape.items.safeParse(payload.items);
  if (!items.success) return { ok: false, error: firstIssue(items.error) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("add_order_items", {
    _order_id: orderId,
    _items: items.data,
  });

  if (error) return { ok: false, error: mapRpcError(error) };
  revalidateOrders();
  return { ok: true };
}

export async function removeOrderItem(itemId: string): Promise<ActionResult> {
  const context = await requireOrgContext();
  if (!can(context.role, "orders.update")) return { ok: false, error: "Sin permisos." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_order_item", { _item_id: itemId });

  if (error) return { ok: false, error: mapRpcError(error) };
  revalidateOrders();
  return { ok: true };
}

export async function sendOrder(orderId: string): Promise<ActionResult> {
  const context = await requireOrgContext();
  if (!can(context.role, "orders.update")) return { ok: false, error: "Sin permisos." };
  if (!context.canOperate) return { ok: false, error: "La suscripción no está activa." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("send_order", { _order_id: orderId });

  if (error) return { ok: false, error: mapRpcError(error) };
  revalidateOrders();
  return { ok: true };
}

export async function cancelOrder(orderId: string, reason?: string): Promise<ActionResult> {
  const context = await requireOrgContext();
  if (!can(context.role, "orders.cancel")) return { ok: false, error: "Sin permisos." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_order", {
    _order_id: orderId,
    _reason: reason ?? null,
  });

  if (error) return { ok: false, error: mapRpcError(error) };
  revalidateOrders();
  return { ok: true };
}

export async function advanceItem(
  itemId: string,
  status: "pending" | "preparing" | "ready" | "served"
): Promise<ActionResult> {
  const context = await requireOrgContext();
  if (!can(context.role, "orders.update") && !can(context.role, "kitchen.update")) {
    return { ok: false, error: "Sin permisos." };
  }
  if (!context.canOperate) return { ok: false, error: "La suscripción no está activa." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("advance_order_item", {
    _item_id: itemId,
    _status: status,
  });

  if (error) return { ok: false, error: mapRpcError(error) };
  revalidateOrders();
  return { ok: true };
}

export type SessionOption = { id: string; tableName: string; status: string };

export async function listOpenSessions(): Promise<SessionOption[]> {
  const context = await requireOrgContext();
  const supabase = await createClient();

  const { data } = await supabase
    .from("table_sessions")
    .select("id, status, dining_tables(name)")
    .eq("branch_id", context.branchId)
    .neq("status", "closed");

  return (data ?? []).map((row) => ({
    id: row.id,
    tableName:
      firstOf<{ name: string }>(row.dining_tables as unknown as { name: string } | null)?.name ??
      "Mesa",
    status: row.status,
  }));
}

export { orderItemSchema };
