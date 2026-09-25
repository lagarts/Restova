import Link from "next/link";
import {
  ArrowRight,
  ChefHat,
  ClipboardList,
  Package,
  Receipt,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import { requireOrgContext } from "@/lib/tenant/require";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, formatTime, startOfDayIso } from "@/lib/utils/date";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const ACTIVE_STATUSES = ["sent", "received", "preparing", "ready", "delivered"];

export default async function DashboardPage() {
  const context = await requireOrgContext();
  const supabase = await createClient();
  const todayFrom = startOfDayIso(context.branch.timezone);

  const [registerResult, salesResult, ordersResult, tablesResult, sessionsResult, topResult] =
    await Promise.all([
      supabase
        .from("cash_registers")
        .select("id, opening_amount, opened_at")
        .eq("branch_id", context.branchId)
        .eq("status", "open")
        .maybeSingle(),
      supabase
        .from("sales")
        .select("id, total, receipt_number, paid_at")
        .eq("branch_id", context.branchId)
        .gte("paid_at", todayFrom)
        .order("paid_at", { ascending: false }),
      supabase
        .from("orders")
        .select("id, status, order_number, channel, table_session_id")
        .eq("branch_id", context.branchId)
        .in("status", ACTIVE_STATUSES),
      supabase
        .from("dining_tables")
        .select("id, name, capacity")
        .eq("branch_id", context.branchId)
        .is("deleted_at", null),
      supabase
        .from("table_sessions")
        .select("id, table_id, opened_at, status")
        .eq("branch_id", context.branchId)
        .neq("status", "closed"),
      supabase
        .from("order_items")
        .select("name_snapshot, quantity, orders!inner(status, paid_at, branch_id)")
        .eq("orders.branch_id", context.branchId)
        .eq("orders.status", "paid")
        .gte("orders.paid_at", todayFrom)
        .limit(500),
    ]);

  const register = registerResult.data;
  const sales = salesResult.data ?? [];
  const activeOrders = ordersResult.data ?? [];
  const tables = tablesResult.data ?? [];
  const sessions = sessionsResult.data ?? [];

  const totalSold = sales.reduce((sum, sale) => sum + Number(sale.total), 0);
  const occupiedIds = new Set(sessions.map((session) => session.table_id));
  const occupiedTables = tables.filter((table) => occupiedIds.has(table.id)).length;
  const awaitingPayment = sessions.filter((session) => session.status === "awaiting_payment").length;

  const topProducts = aggregateProducts(topResult.data ?? []);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">{context.branch.name}</p>
        </div>
        {!context.canOperate ? (
          <Badge variant="outline" className="border-warning text-warning">
            Suscripción vencida
          </Badge>
        ) : register ? (
          <Badge className="gap-1.5 bg-success/10 text-success hover:bg-success/10">
            <span className="size-1.5 rounded-full bg-success" /> Caja abierta
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1.5 border-destructive/40 text-destructive">
            <span className="size-1.5 rounded-full bg-destructive" /> Caja cerrada
          </Badge>
        )}
      </header>

      {!context.canOperate && (
        <Alert>
          <AlertTitle>Período gratuito finalizado</AlertTitle>
          <AlertDescription>
            Podés ver la información del negocio, pero no podés abrir caja ni facturar.{" "}
            <Link href="/configuracion/suscripcion" className="font-medium text-primary underline">
              Activá tu suscripción
            </Link>{" "}
            para continuar.
          </AlertDescription>
        </Alert>
      )}

      {context.canOperate && !register && (
        <Alert>
          <AlertTitle>Para comenzar a operar debes abrir la caja.</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <Button render={<Link href="/caja" />} size="sm">
              Abrir caja <ArrowRight className="size-4" />
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Receipt}
          label="Ventas de hoy"
          value={formatMoney(totalSold)}
          hint={`${sales.length} ${sales.length === 1 ? "venta" : "ventas"}`}
        />
        <StatCard
          icon={ClipboardList}
          label="Pedidos activos"
          value={String(activeOrders.length)}
          hint="En salón y delivery"
        />
        <StatCard
          icon={UtensilsCrossed}
          label="Mesas ocupadas"
          value={`${occupiedTables}/${tables.length}`}
          hint={`${Math.max(0, tables.length - occupiedTables)} libres`}
        />
        <StatCard
          icon={Wallet}
          label="Caja"
          value={register ? "Abierta" : "Cerrada"}
          hint={
            register
              ? `Desde las ${formatTime(register.opened_at)} · ${formatMoney(Number(register.opening_amount))}`
              : "Sin turno activo"
          }
          tone={register ? "success" : "muted"}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-medium">
              <Receipt className="size-4 text-primary" /> Últimas ventas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {sales.length === 0 ? (
              <EmptyState icon={Receipt} text="Todavía no hay ventas hoy." />
            ) : (
              <ul className="divide-y">
                {sales.slice(0, 6).map((sale) => (
                  <li key={sale.id} className="flex items-center justify-between py-2.5 text-sm">
                    <span className="text-muted-foreground">
                      Comanda #{sale.receipt_number} · {formatTime(sale.paid_at)}
                    </span>
                    <span className="font-medium tabular-nums">{formatMoney(Number(sale.total))}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-medium">
              <Package className="size-4 text-primary" /> Productos más vendidos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topProducts.length === 0 ? (
              <EmptyState icon={ChefHat} text="Sin datos todavía. Facturá tu primer pedido." />
            ) : (
              <ul className="divide-y">
                {topProducts.slice(0, 6).map((product) => (
                  <li key={product.name} className="flex items-center justify-between py-2.5 text-sm">
                    <span className="truncate">{product.name}</span>
                    <span className="ml-3 shrink-0 font-medium tabular-nums">{product.quantity}u</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      {awaitingPayment > 0 && (
        <p className="text-sm text-muted-foreground">
          {awaitingPayment} mesa(s) esperando pago.
        </p>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "success" | "muted";
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="size-4 text-primary" />
      </CardHeader>
      <CardContent>
        <div
          className={
            tone === "success"
              ? "text-2xl font-semibold tabular-nums text-success"
              : tone === "muted"
                ? "text-2xl font-semibold tabular-nums text-muted-foreground"
                : "text-2xl font-semibold tabular-nums"
          }
        >
          {value}
        </div>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function EmptyState({ icon: Icon, text }: { icon: React.ComponentType<{ className?: string }>; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <Icon className="size-6 text-muted-foreground/50" />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function aggregateProducts(
  rows: { name_snapshot: string; quantity: number }[]
): { name: string; quantity: number }[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    totals.set(row.name_snapshot, (totals.get(row.name_snapshot) ?? 0) + row.quantity);
  }
  return [...totals.entries()]
    .map(([name, quantity]) => ({ name, quantity }))
    .sort((a, b) => b.quantity - a.quantity);
}
