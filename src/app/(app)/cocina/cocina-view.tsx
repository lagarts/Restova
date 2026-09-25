"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChefHat, Loader2, RefreshCw } from "lucide-react";
import { advanceItem } from "@/app/(app)/pedidos/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { minutesSince } from "@/lib/utils/date";

export type KitchenOrder = {
  id: string;
  orderNumber: number;
  status: string;
  sentAt: string | null;
  createdAt: string;
  notes: string | null;
  tableName: string;
  items: {
    id: string;
    name: string;
    quantity: number;
    notes: string | null;
    status: string;
  }[];
};

type Props = {
  orders: KitchenOrder[];
  orgId: string;
  canUpdate: boolean;
  canOperate: boolean;
};

const ITEM_ACTION: Record<string, { status: "preparing" | "ready" | "served"; label: string }> = {
  pending: { status: "preparing", label: "Empezar" },
  preparing: { status: "ready", label: "Listo" },
  ready: { status: "served", label: "Servir" },
};

export default function CocinaView({ orders, orgId, canUpdate, canOperate }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [live, setLive] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`kds-${orgId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `org_id=eq.${orgId}` },
        () => router.refresh()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_items", filter: `org_id=eq.${orgId}` },
        () => router.refresh()
      )
      .subscribe((status) => setLive(status === "SUBSCRIBED"));

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, router]);

  function advance(itemId: string, status: "preparing" | "ready" | "served") {
    startTransition(async () => {
      const result = await advanceItem(itemId, status);
      if (!result.ok) setError(result.error);
      else setError(null);
      router.refresh();
    });
  }

  const cooking = orders.filter((order) => ["sent", "received", "preparing"].includes(order.status));
  const ready = orders.filter((order) => order.status === "ready");

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cocina</h1>
          <p className="text-sm text-muted-foreground">
            {cooking.length} en preparación · {ready.length} lista{ready.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={live ? "secondary" : "outline"}>
            <span
              className={`mr-1.5 size-1.5 rounded-full ${live ? "bg-success" : "bg-muted-foreground"}`}
            />
            {live ? "En vivo" : "Desconectado"}
          </Badge>
          <Button size="sm" variant="outline" onClick={() => router.refresh()}>
            <RefreshCw className="size-4" /> Actualizar
          </Button>
        </div>
      </header>

      {!canOperate && (
        <Alert>
          <AlertDescription>La suscripción no está activa: no se puede operar.</AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Column title="En preparación" count={cooking.length}>
          {cooking.length === 0 && <Empty text="No hay pedidos pendientes." />}
          {cooking.map((order) => (
            <Ticket
              key={order.id}
              order={order}
              canUpdate={canUpdate}
              pending={pending}
              onAdvance={advance}
            />
          ))}
        </Column>

        <Column title="Listas para servir" count={ready.length}>
          {ready.length === 0 && <Empty text="No hay comandas listas." />}
          {ready.map((order) => (
            <Ticket
              key={order.id}
              order={order}
              canUpdate={canUpdate}
              pending={pending}
              onAdvance={advance}
            />
          ))}
        </Column>
      </div>
    </div>
  );
}

function Column({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base font-medium">{title}</CardTitle>
        <Badge variant="secondary">{count}</Badge>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <ChefHat className="size-7 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function Ticket({
  order,
  canUpdate,
  pending,
  onAdvance,
}: {
  order: KitchenOrder;
  canUpdate: boolean;
  pending: boolean;
  onAdvance: (itemId: string, status: "preparing" | "ready" | "served") => void;
}) {
  const reference = order.sentAt ?? order.createdAt;
  const minutes = minutesSince(reference);
  const urgent = minutes >= 15;

  return (
    <div className={`rounded-xl border-2 ${urgent ? "border-warning" : "border-border"}`}>
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">#{order.orderNumber}</span>
          <Badge variant="outline">{order.tableName}</Badge>
        </div>
        <span className={`text-xs tabular-nums ${urgent ? "font-semibold text-warning" : "text-muted-foreground"}`}>
          {minutes} min
        </span>
      </div>

      <ul className="divide-y">
        {order.items.map((item) => {
          const action = ITEM_ACTION[item.status];
          return (
            <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {item.quantity}× {item.name}
                </p>
                {item.notes && (
                  <p className="text-xs text-muted-foreground italic">{item.notes}</p>
                )}
              </div>
              {canUpdate && action && (
                <Button
                  size="sm"
                  variant={item.status === "ready" ? "default" : "outline"}
                  disabled={pending}
                  onClick={() => onAdvance(item.id, action.status)}
                >
                  {pending && <Loader2 className="size-3 animate-spin" />}
                  {action.label}
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      {order.notes && (
        <p className="border-t px-3 py-2 text-xs text-muted-foreground">{order.notes}</p>
      )}
    </div>
  );
}
