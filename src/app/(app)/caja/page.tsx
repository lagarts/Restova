import { requireOrgContext } from "@/lib/tenant/require";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/auth/rbac";
import { firstOf } from "@/lib/utils/embed";
import CajaView, {
  type CheckoutInfo,
  type MovementRow,
  type RegisterRow,
} from "./caja-view";

export default async function CajaPage({
  searchParams,
}: {
  searchParams: Promise<{ mesa?: string }>;
}) {
  const context = await requireOrgContext();
  const supabase = await createClient();
  const { mesa } = await searchParams;

  const { data: register } = await supabase
    .from("cash_registers")
    .select("*")
    .eq("branch_id", context.branchId)
    .eq("status", "open")
    .maybeSingle();

  let movements: MovementRow[] = [];
  if (register) {
    const { data } = await supabase
      .from("cash_movements")
      .select("id, type, method, amount, concept, created_at")
      .eq("cash_register_id", (register as { id: string }).id)
      .order("created_at", { ascending: false })
      .limit(200);

    movements = ((data ?? []) as MovementRow[]).map((movement) => ({
      ...movement,
      amount: Number(movement.amount),
    }));
  }

  let checkout: CheckoutInfo | null = null;
  if (mesa) {
    const { data: session } = await supabase
      .from("table_sessions")
      .select("id, opened_at, waiter_id, guest_count, dining_tables(name)")
      .eq("table_id", mesa)
      .neq("status", "closed")
      .maybeSingle();

    if (session) {
      const { data: orders } = await supabase
        .from("orders")
        .select("id, order_number, status, total")
        .eq("table_session_id", (session as { id: string }).id)
        .neq("status", "cancelled")
        .neq("status", "paid");

      const rows = (orders ?? []) as {
        id: string;
        order_number: number;
        status: string;
        total: number;
      }[];

      checkout = {
        sessionId: (session as { id: string }).id,
        tableName:
          firstOf<{ name: string }>(
            (session as { dining_tables: unknown }).dining_tables as { name: string } | null
          )?.name ?? "Mesa",
        openedAt: (session as { opened_at: string }).opened_at,
        hasDraft: rows.some((order) => order.status === "draft"),
        orders: rows.map((order) => ({
          orderNumber: order.order_number,
          status: order.status,
          total: Number(order.total),
        })),
        total: rows.reduce((sum, order) => sum + Number(order.total), 0),
      };
    }
  }

  return (
    <CajaView
      register={(register as RegisterRow | null) ?? null}
      movements={movements}
      checkout={checkout}
      canOpen={can(context.role, "cash.open")}
      canClose={can(context.role, "cash.close")}
      canCharge={can(context.role, "orders.charge") || can(context.role, "cash.view")}
      canOperate={context.canOperate}
      branchName={context.branch.name}
    />
  );
}
