import { requireOrgContext } from "@/lib/tenant/require";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/auth/rbac";
import { firstOf } from "@/lib/utils/embed";
import { startOfDayIso } from "@/lib/utils/date";
import VentasView, { type SaleRow } from "./ventas-view";

type Period = "hoy" | "7d" | "mes";

function range(period: Period): { from: string; to: string } {
  const now = new Date();
  const reference =
    period === "hoy"
      ? now
      : period === "7d"
        ? new Date(now.getTime() - 6 * 86400000)
        : new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    from: startOfDayIso(undefined, reference),
    to: new Date(now.getTime() + 86400000).toISOString(),
  };
}

export default async function VentasPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const context = await requireOrgContext();
  const supabase = await createClient();

  const params = await searchParams;
  const period: Period = params.periodo === "7d" || params.periodo === "mes" ? params.periodo : "hoy";
  const { from, to } = range(period);

  const { data: saleRows } = await supabase
    .from("sales")
    .select(
      "id, receipt_number, receipt_day, paid_at, total, subtotal, discount_amount, channel, notes, table_sessions(dining_tables(name)), customers(name)"
    )
    .eq("branch_id", context.branchId)
    .gte("paid_at", from)
    .lt("paid_at", to)
    .order("paid_at", { ascending: false })
    .limit(200);

  const rows = (saleRows ?? []) as unknown as {
    id: string;
    receipt_number: number;
    receipt_day: string;
    paid_at: string;
    total: number;
    subtotal: number;
    discount_amount: number;
    channel: string;
    notes: string | null;
    table_sessions: unknown;
    customers: unknown;
  }[];

  const saleIds = rows.map((row) => row.id);
  const paymentsBySale = new Map<string, { method: string; amount: number }[]>();

  if (saleIds.length > 0) {
    const { data } = await supabase
      .from("sale_payments")
      .select("sale_id, method, amount")
      .in("sale_id", saleIds);

    for (const payment of (data ?? []) as { sale_id: string; method: string; amount: number }[]) {
      const list = paymentsBySale.get(payment.sale_id) ?? [];
      list.push({ method: payment.method, amount: Number(payment.amount) });
      paymentsBySale.set(payment.sale_id, list);
    }
  }

  const sales: SaleRow[] = rows.map((row) => ({
    id: row.id,
    receiptNumber: row.receipt_number,
    receiptDay: row.receipt_day,
    paidAt: row.paid_at,
    total: Number(row.total),
    subtotal: Number(row.subtotal),
    discount: Number(row.discount_amount),
    channel: row.channel,
    notes: row.notes,
    tableName: firstOf<{ name: string }>(row.table_sessions as { name: string } | null)?.name ?? null,
    customerName: firstOf<{ name: string }>(row.customers as { name: string } | null)?.name ?? null,
    payments: paymentsBySale.get(row.id) ?? [],
  }));

  return (
    <VentasView
      sales={sales}
      period={period}
      canRefund={can(context.role, "reports.view")}
      branchName={context.branch.name}
    />
  );
}
