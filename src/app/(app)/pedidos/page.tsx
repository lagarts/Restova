import Link from "next/link";
import { requireOrgContext } from "@/lib/tenant/require";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/auth/rbac";
import { firstOf } from "@/lib/utils/embed";
import type { Category, Product, ModifierGroup, ModifierOption } from "@/types/domain";
import PedidosView, {
  type OrderRow,
  type SessionRow,
} from "./pedidos-view";

export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<{ mesa?: string }>;
}) {
  const context = await requireOrgContext();
  const supabase = await createClient();
  const { mesa } = await searchParams;

  const [
    sessionsResult,
    categoriesResult,
    productsResult,
    groupsResult,
    optionsResult,
    linksResult,
  ] = await Promise.all([
    supabase
      .from("table_sessions")
      .select("id, table_id, status, opened_at, waiter_id, guest_count, dining_tables(name)")
      .eq("branch_id", context.branchId)
      .neq("status", "closed"),
    supabase
      .from("categories")
      .select("*")
      .eq("branch_id", context.branchId)
      .is("deleted_at", null)
      .eq("active", true)
      .order("sort_order")
      .order("name"),
    supabase
      .from("products")
      .select("*")
      .eq("branch_id", context.branchId)
      .is("deleted_at", null)
      .eq("available", true)
      .order("sort_order")
      .order("name"),
    supabase.from("modifier_groups").select("*").eq("branch_id", context.branchId).is("deleted_at", null).eq("active", true).order("sort_order"),
    supabase.from("modifier_options").select("*").is("deleted_at", null).eq("available", true).order("sort_order"),
    supabase.from("product_modifier_groups").select("product_id, group_id").eq("org_id", context.orgId),
  ]);

  const sessions =
    (sessionsResult.data ?? []).map((row) => ({
      id: row.id,
      tableId: row.table_id,
      tableName:
        firstOf<{ name: string }>(row.dining_tables as unknown as { name: string } | null)
          ?.name ?? "Mesa",
      status: row.status as "open" | "awaiting_payment",
      openedAt: row.opened_at as string,
      waiterId: row.waiter_id as string | null,
      guestCount: row.guest_count as number | null,
    })) satisfies SessionRow[];

  const selected = mesa ? sessions.find((session) => session.tableId === mesa) ?? null : null;

  let orders: OrderRow[] = [];
  if (selected) {
    const { data: orderRows } = await supabase
      .from("orders")
      .select("id, order_number, status, total, subtotal, created_at, sent_at, notes")
      .eq("table_session_id", selected.id)
      .neq("status", "paid")
      .neq("status", "cancelled")
      .order("created_at");

    const rows = (orderRows ?? []) as {
      id: string;
      order_number: number;
      status: string;
      total: number;
      subtotal: number;
      created_at: string;
      sent_at: string | null;
      notes: string | null;
    }[];

    const orderIds = rows.map((order) => order.id);
    const itemIds: string[] = [];
    const itemsByOrder = new Map<string, OrderRow["items"]>();
    const modifierByItem = new Map<string, { name: string; priceDelta: number }[]>();

    if (orderIds.length > 0) {
      const { data } = await supabase
        .from("order_items")
        .select(
          "id, order_id, name_snapshot, unit_price, modifier_total, quantity, subtotal, notes, status, sort_order"
        )
        .in("order_id", orderIds)
        .order("sort_order");

      for (const item of (data ?? []) as {
        id: string;
        order_id: string;
        name_snapshot: string;
        unit_price: number;
        modifier_total: number;
        quantity: number;
        subtotal: number;
        notes: string | null;
        status: string;
      }[]) {
        itemIds.push(item.id);
        const list = itemsByOrder.get(item.order_id) ?? [];
        list.push({
          id: item.id,
          name: item.name_snapshot,
          unitPrice: Number(item.unit_price),
          modifierTotal: Number(item.modifier_total),
          quantity: item.quantity,
          subtotal: Number(item.subtotal),
          notes: item.notes,
          status: item.status,
          modifiers: [],
        });
        itemsByOrder.set(item.order_id, list);
      }

      if (itemIds.length > 0) {
        const { data: modifierData } = await supabase
          .from("order_item_modifiers")
          .select("order_item_id, name_snapshot, price_delta")
          .in("order_item_id", itemIds);

        for (const modifier of (modifierData ?? []) as {
          order_item_id: string;
          name_snapshot: string;
          price_delta: number;
        }[]) {
          const list = modifierByItem.get(modifier.order_item_id) ?? [];
          list.push({
            name: modifier.name_snapshot,
            priceDelta: Number(modifier.price_delta),
          });
          modifierByItem.set(modifier.order_item_id, list);
        }
      }
    }

    orders = rows.map((order) => ({
      id: order.id,
      orderNumber: order.order_number,
      status: order.status,
      total: Number(order.total),
      subtotal: Number(order.subtotal),
      createdAt: order.created_at,
      sentAt: order.sent_at,
      notes: order.notes,
      items: (itemsByOrder.get(order.id) ?? []).map((item) => ({
        ...item,
        modifiers: modifierByItem.get(item.id) ?? [],
      })),
    }));
  }

  const optionsByGroup = new Map<string, ModifierOption[]>();
  for (const option of (optionsResult.data ?? []) as ModifierOption[]) {
    const list = optionsByGroup.get(option.group_id) ?? [];
    list.push(option);
    optionsByGroup.set(option.group_id, list);
  }

  const groups = new Map<string, ModifierGroup>();
  for (const group of (groupsResult.data ?? []) as ModifierGroup[]) {
    groups.set(group.id, {
      ...group,
      options: optionsByGroup.get(group.id) ?? [],
    });
  }

  const groupsByProduct: Record<string, ModifierGroup[]> = {};
  for (const link of linksResult.data ?? []) {
    const group = groups.get(link.group_id);
    if (!group) continue;
    (groupsByProduct[link.product_id] ??= []).push(group);
  }

  const total = orders.reduce((sum, order) => sum + order.total, 0);

  if (!context.canOperate) {
    return (
      <div className="space-y-5">
        <h1 className="text-2xl font-semibold tracking-tight">Pedidos</h1>
        <p className="text-sm text-muted-foreground">
          La suscripción no está activa: la operación está pausada.
        </p>
        <Link className="text-sm underline" href="/configuracion/suscripcion">
          Ver suscripción
        </Link>
      </div>
    );
  }

  return (
    <PedidosView
      sessions={sessions}
      selected={selected}
      orders={orders}
      total={total}
      categories={(categoriesResult.data ?? []) as Category[]}
      products={(productsResult.data ?? []) as Product[]}
      groupsByProduct={groupsByProduct}
      canCreate={can(context.role, "orders.create")}
      canCancel={can(context.role, "orders.cancel")}
      canCharge={can(context.role, "orders.charge")}
      canAdvance={
        can(context.role, "orders.update") || can(context.role, "kitchen.update")
      }
    />
  );
}
