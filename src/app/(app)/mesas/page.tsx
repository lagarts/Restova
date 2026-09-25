import { requireOrgContext } from "@/lib/tenant/require";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/auth/rbac";
import type { DiningTable } from "@/types/domain";
import MesasView, { type TableStatus } from "./mesas-view";

type SessionRow = {
  id: string;
  table_id: string;
  status: "open" | "awaiting_payment" | "closed";
  opened_at: string;
  waiter_id: string | null;
  guest_count: number | null;
};

export default async function MesasPage() {
  const context = await requireOrgContext();
  const supabase = await createClient();

  const [{ data: tables }, { data: sessions }] = await Promise.all([
    supabase
      .from("dining_tables")
      .select("*")
      .eq("branch_id", context.branchId)
      .is("deleted_at", null)
      .order("sort_order")
      .order("name"),
    supabase
      .from("table_sessions")
      .select("id, table_id, status, opened_at, waiter_id, guest_count")
      .eq("branch_id", context.branchId)
      .neq("status", "closed"),
  ]);

  const sessionRows = (sessions ?? []) as SessionRow[];
  const sessionIds = sessionRows.map((session) => session.id);

  const { data: orderRows } = sessionIds.length
    ? await supabase
        .from("orders")
        .select("table_session_id, status")
        .in("table_session_id", sessionIds)
        .neq("status", "cancelled")
        .neq("status", "paid")
    : { data: [] as { table_session_id: string; status: string }[] };

  const statusBySession = new Map<string, string>();
  for (const row of (orderRows ?? []) as { table_session_id: string; status: string }[]) {
    const current = statusBySession.get(row.table_session_id);
    statusBySession.set(row.table_session_id, mergeStatus(current, row.status));
  }

  const sessionByTable = new Map<string, { session: SessionRow; status: TableStatus }>();
  for (const session of sessionRows) {
    sessionByTable.set(session.table_id, {
      session,
      status: deriveStatus(session, statusBySession.get(session.id)),
    });
  }

  return (
    <MesasView
      tables={(tables ?? []).map((table) => ({
        ...table,
        capacity: Number(table.capacity),
        pos_x: Number(table.pos_x),
        pos_y: Number(table.pos_y),
        width: Number(table.width),
        height: Number(table.height),
        sort_order: Number(table.sort_order),
      })) as DiningTable[]}
      sessionByTable={sessionByTable}
      canManage={can(context.role, "tables.manage")}
      canOpen={can(context.role, "orders.create") && context.canOperate}
      canOperate={context.canOperate}
    />
  );
}

function mergeStatus(current: string | undefined, incoming: string): string {
  const rank: Record<string, number> = {
    draft: 0,
    sent: 1,
    received: 2,
    preparing: 3,
    ready: 4,
    delivered: 5,
  };
  if (!current) return incoming;
  return (rank[incoming] ?? 0) > (rank[current] ?? 0) ? incoming : current;
}

function deriveStatus(session: SessionRow, orderStatus?: string): TableStatus {
  if (session.status === "awaiting_payment") return "awaiting_payment";
  switch (orderStatus) {
    case undefined:
      return "open";
    case "draft":
      return "open";
    case "sent":
    case "received":
      return "ordered";
    case "preparing":
      return "preparing";
    case "ready":
      return "ready";
    case "delivered":
      return "awaiting_payment";
    default:
      return "open";
  }
}
