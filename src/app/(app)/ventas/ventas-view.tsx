"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PAYMENT_LABELS, type PaymentMethod } from "@/lib/validation/cash";
import { formatMoney, formatTime } from "@/lib/utils/date";

export type SaleRow = {
  id: string;
  receiptNumber: number;
  receiptDay: string;
  paidAt: string;
  total: number;
  subtotal: number;
  discount: number;
  channel: string;
  notes: string | null;
  tableName: string | null;
  customerName: string | null;
  payments: { method: string; amount: number }[];
};

const PERIODS = [
  { id: "hoy", label: "Hoy" },
  { id: "7d", label: "7 días" },
  { id: "mes", label: "Este mes" },
] as const;

const CHANNEL_LABEL: Record<string, string> = {
  salon: "Salón",
  delivery: "Delivery",
  pickup: "Retiro",
  phone: "Teléfono",
  web: "Web",
};

type Props = {
  sales: SaleRow[];
  period: string;
  canRefund: boolean;
  branchName: string;
};

export default function VentasView({ sales, period, branchName, canRefund }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const total = sales.reduce((sum, sale) => sum + sale.total, 0);
  const avg = sales.length > 0 ? total / sales.length : 0;
  const discount = sales.reduce((sum, sale) => sum + sale.discount, 0);

  const byMethod = new Map<string, number>();
  for (const sale of sales) {
    for (const payment of sale.payments) {
      byMethod.set(payment.method, (byMethod.get(payment.method) ?? 0) + payment.amount);
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ventas</h1>
          <p className="text-sm text-muted-foreground">{branchName}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PERIODS.map((option) => (
            <Button
              key={option.id}
              size="sm"
              variant={period === option.id ? "default" : "outline"}
              disabled={pending}
              onClick={() =>
                startTransition(() => {
                  router.push(`/ventas?periodo=${option.id}`);
                })
              }
            >
              {option.label}
            </Button>
          ))}
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Facturado" value={formatMoney(total)} />
        <Stat label="Comprobantes" value={String(sales.length)} />
        <Stat label="Ticket promedio" value={formatMoney(avg)} />
        <Stat label="Descuentos" value={formatMoney(discount)} />
      </div>

      {byMethod.size > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">Por medio de pago</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            {[...byMethod.entries()].map(([method, amount]) => (
              <div key={method} className="rounded-lg border px-3 py-2">
                <p className="text-xs text-muted-foreground">
                  {PAYMENT_LABELS[method as PaymentMethod] ?? method}
                </p>
                <p className="text-sm font-semibold tabular-nums">{formatMoney(amount)}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Comprobantes</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {sales.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-14 text-center">
              <Receipt className="size-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No hay ventas en este periodo.</p>
            </div>
          ) : (
            <ul className="divide-y">
              {sales.map((sale) => (
                <li key={sale.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      #{sale.receiptNumber}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {formatTime(sale.paidAt)}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {[
                        sale.tableName,
                        sale.customerName,
                        CHANNEL_LABEL[sale.channel] ?? sale.channel,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Sin referencia"}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {sale.payments.map((payment, index) => (
                        <Badge key={index} variant="outline" className="text-[11px]">
                          {PAYMENT_LABELS[payment.method as PaymentMethod] ?? payment.method}{" "}
                          {formatMoney(payment.amount)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-semibold tabular-nums">{formatMoney(sale.total)}</p>
                    {sale.discount > 0 && (
                      <p className="text-xs text-muted-foreground">
                        -{formatMoney(sale.discount)} desc.
                      </p>
                    )}
                    {canRefund && sale.notes && (
                      <p className="text-xs text-muted-foreground italic">{sale.notes}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}
