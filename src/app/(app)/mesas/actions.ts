"use server";

import { revalidatePath } from "next/cache";
import { requireOrgContext } from "@/lib/tenant/require";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/auth/rbac";
import { tableSchema } from "@/lib/validation/floor";
import { firstIssue } from "@/lib/validation/common";
import { minutesSince } from "@/lib/utils/date";

export type ActionResult = { ok: true } | { ok: false; error: string };

function revalidateFloor() {
  revalidatePath("/mesas");
  revalidatePath("/dashboard");
}

export async function saveTable(tableId: string | null, formData: FormData): Promise<ActionResult> {
  const context = await requireOrgContext();
  if (!can(context.role, "tables.manage")) return { ok: false, error: "Sin permisos." };

  const parsed = tableSchema.safeParse({
    name: formData.get("name"),
    capacity: formData.get("capacity") ?? "4",
    sector: formData.get("sector") ?? "Salón",
    pos_x: formData.get("pos_x") ?? "0",
    pos_y: formData.get("pos_y") ?? "0",
    width: formData.get("width") ?? "2",
    height: formData.get("height") ?? "1",
  });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const payload = {
    ...parsed.data,
    sector: parsed.data.sector || "Salón",
  };

  if (tableId) {
    const { error } = await supabase
      .from("dining_tables")
      .update(payload)
      .eq("id", tableId)
      .eq("branch_id", context.branchId);
    if (error) return { ok: false, error: "No pudimos guardar la mesa." };
  } else {
    const { data: max } = await supabase
      .from("dining_tables")
      .select("sort_order")
      .eq("branch_id", context.branchId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { error } = await supabase.from("dining_tables").insert({
      org_id: context.orgId,
      branch_id: context.branchId,
      sort_order: (max?.sort_order ?? -1) + 1,
      ...payload,
    });
    if (error) return { ok: false, error: "No pudimos crear la mesa." };
  }

  revalidateFloor();
  return { ok: true };
}

export async function moveTable(
  tableId: string,
  position: { pos_x: number; pos_y: number; width: number; height: number }
): Promise<ActionResult> {
  const context = await requireOrgContext();
  if (!can(context.role, "tables.manage")) return { ok: false, error: "Sin permisos." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("dining_tables")
    .update(position)
    .eq("id", tableId)
    .eq("branch_id", context.branchId);

  if (error) return { ok: false, error: "No pudimos mover la mesa." };
  revalidateFloor();
  return { ok: true };
}

export async function deleteTable(tableId: string): Promise<ActionResult> {
  const context = await requireOrgContext();
  if (!can(context.role, "tables.manage")) return { ok: false, error: "Sin permisos." };

  const supabase = await createClient();

  const { count } = await supabase
    .from("table_sessions")
    .select("id", { count: "exact", head: true })
    .eq("table_id", tableId)
    .neq("status", "closed");

  if (count) return { ok: false, error: "Cerrá la mesa antes de eliminarla." };

  const { error } = await supabase
    .from("dining_tables")
    .delete()
    .eq("id", tableId)
    .eq("branch_id", context.branchId);

  if (error) return { ok: false, error: "No pudimos eliminar la mesa." };
  revalidateFloor();
  return { ok: true };
}

export async function openTableSession(
  tableId: string,
  waiterId: string | null
): Promise<ActionResult> {
  const context = await requireOrgContext();
  if (!can(context.role, "orders.create")) return { ok: false, error: "Sin permisos." };
  if (!context.canOperate) return { ok: false, error: "La suscripción no está activa." };

  const supabase = await createClient();
  const { error } = await supabase.from("table_sessions").insert({
    org_id: context.orgId,
    branch_id: context.branchId,
    table_id: tableId,
    opened_by: context.userId,
    waiter_id: waiterId ?? context.userId,
  });

  if (error) {
    if (error.code === "23505") return { ok: false, error: "La mesa ya está abierta." };
    return { ok: false, error: "No pudimos abrir la mesa." };
  }

  revalidateFloor();
  return { ok: true };
}

export async function markSessionAwaitingPayment(sessionId: string): Promise<ActionResult> {
  const context = await requireOrgContext();
  if (!can(context.role, "orders.update")) return { ok: false, error: "Sin permisos." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("table_sessions")
    .update({ status: "awaiting_payment" })
    .eq("id", sessionId)
    .eq("branch_id", context.branchId);

  if (error) return { ok: false, error: "No pudimos actualizar la mesa." };
  revalidateFloor();
  return { ok: true };
}

export type TableDetail = {
  session: {
    id: string;
    opened_at: string;
    status: "open" | "awaiting_payment" | "closed";
    waiter_name: string | null;
    notes: string | null;
    guest_count: number | null;
  } | null;
  orders: {
    id: string;
    order_number: number;
    status: string;
    total: number;
    created_at: string;
    items: { name: string; quantity: number; subtotal: number; notes: string | null }[];
  }[];
  total: number;
  minutes: number;
  waiter_id: string | null;
};

export async function getTableDetail(tableId: string): Promise<TableDetail | { error: string }> {
  await requireOrgContext();
  const supabase = await createClient();

  const { data: session } = await supabase
    .from("table_sessions")
    .select("id, opened_at, status, waiter_id, notes, guest_count")
    .eq("table_id", tableId)
    .neq("status", "closed")
    .maybeSingle();

  if (!session) {
    return { session: null, orders: [], total: 0, minutes: 0, waiter_id: null };
  }

  const [ordersResult, waiterResult] = await Promise.all([
    supabase
      .from("orders")
      .select("id, order_number, status, total, created_at")
      .eq("table_session_id", session.id)
      .neq("status", "cancelled")
      .order("created_at"),
    session.waiter_id
      ? supabase.from("profiles").select("full_name").eq("id", session.waiter_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const orders = ordersResult.data ?? [];
  const orderIds = orders.map((order) => order.id);

  const itemsResult = orderIds.length
    ? await supabase
        .from("order_items")
        .select("order_id, name_snapshot, quantity, subtotal, notes")
        .in("order_id", orderIds)
        .order("sort_order")
    : { data: [] as { order_id: string; name_snapshot: string; quantity: number; subtotal: number; notes: string | null }[] };

  const items = (itemsResult.data ?? []) as {
    order_id: string;
    name_snapshot: string;
    quantity: number;
    subtotal: number;
    notes: string | null;
  }[];

  const ordersWithItems = orders.map((order) => ({
    id: order.id as string,
    order_number: order.order_number as number,
    status: order.status as string,
    total: Number(order.total),
    created_at: order.created_at as string,
    items: items
      .filter((item) => item.order_id === order.id)
      .map((item) => ({
        name: item.name_snapshot,
        quantity: item.quantity,
        subtotal: Number(item.subtotal),
        notes: item.notes,
      })),
  }));

  return {
    session: {
      id: session.id as string,
      opened_at: session.opened_at as string,
      status: session.status as "open" | "awaiting_payment" | "closed",
      waiter_name:
        (waiterResult.data as { full_name: string | null } | null)?.full_name ?? null,
      notes: session.notes as string | null,
      guest_count: session.guest_count as number | null,
    },
    orders: ordersWithItems,
    total: ordersWithItems.reduce((sum, order) => sum + order.total, 0),
    minutes: minutesSince(session.opened_at as string),
    waiter_id: session.waiter_id as string | null,
  };
}

export async function listWaiters(): Promise<{ id: string; name: string }[]> {
  const context = await requireOrgContext();
  const supabase = await createClient();

  const { data: members } = await supabase
    .from("org_members")
    .select("user_id, role")
    .eq("org_id", context.orgId)
    .eq("active", true)
    .in("role", ["admin", "encargado", "mozo"]);

  const ids = (members ?? []).map((member) => member.user_id);
  if (ids.length === 0) return [];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", ids);

  const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  return (members ?? []).map((member) => ({
    id: member.user_id,
    name: names.get(member.user_id) ?? "Sin nombre",
  }));
}
