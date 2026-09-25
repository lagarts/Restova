import { requireOrgContext } from "@/lib/tenant/require";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/auth/rbac";
import { firstOf } from "@/lib/utils/embed";
import CocinaView, { type KitchenOrder } from "./cocina-view";

type SessionEmbed = { dining_tables: unknown } | null;

function resolveTableName(embed: unknown): string {
  const session = firstOf<SessionEmbed>(embed as SessionEmbed);
  const table = firstOf<{ name: string }>(session?.dining_tables as { name: string } | null);
  return table?.name ?? "Mesa";
}

export default async function CocinaPage() {
  const context = await requireOrgContext();
  const supabase = await createClient();

  const { data: orderRows } = await supabase
    .from("orders")
    .select("id, order_number, status, sent_at, created_at, notes, table_sessions(dining_tables(name))")
    .eq("branch_id", context.branchId)
    .in("status", ["sent", "received", "preparing", "ready"])
    .order("sent_at", { ascending: true });

  const rows = (orderRows ?? []) as unknown as {
    id: string;
    order_number: number;
    status: string;
    sent_at: string | null;
    created_at: string;
    notes: string | null;
    table_sessions: unknown;
  }[];

  const orderIds = rows.map((row) => row.id);
  const itemRows: {
    id: string;
    order_id: string;
    name_snapshot: string;
    quantity: number;
    notes: string | null;
    status: string;
  }[] = [];

  if (orderIds.length > 0) {
    const { data } = await supabase
      .from("order_items")
      .select("id, order_id, name_snapshot, quantity, notes, status, sort_order")
      .in("order_id", orderIds)
      .neq("status", "cancelled")
      .order("sort_order");

    for (const item of (data ?? []) as (typeof itemRows)[number][]) {
      itemRows.push(item);
    }
  }

  const orders: KitchenOrder[] = rows.map((row) => ({
    id: row.id,
    orderNumber: row.order_number,
    status: row.status,
    sentAt: row.sent_at,
    createdAt: row.created_at,
    notes: row.notes,
    tableName: resolveTableName(row.table_sessions),
    items: itemRows
      .filter((item) => item.order_id === row.id)
      .map((item) => ({
        id: item.id,
        name: item.name_snapshot,
        quantity: item.quantity,
        notes: item.notes,
        status: item.status,
      })),
  }));

  return (
    <CocinaView
      orders={orders}
      orgId={context.orgId}
      canUpdate={can(context.role, "kitchen.update") || can(context.role, "orders.update")}
      canOperate={context.canOperate}
    />
  );
}
