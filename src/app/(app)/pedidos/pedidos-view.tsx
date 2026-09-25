"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Plus, Send, Trash2, X } from "lucide-react";
import {
  advanceItem,
  addToOrder,
  cancelOrder,
  removeOrderItem,
  sendOrder,
  startOrder,
} from "@/app/(app)/pedidos/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney, minutesSince } from "@/lib/utils/date";
import type { Category, ModifierGroup, Product } from "@/types/domain";

export type SessionRow = {
  id: string;
  tableId: string;
  tableName: string;
  status: "open" | "awaiting_payment";
  openedAt: string;
  waiterId: string | null;
  guestCount: number | null;
};

export type OrderRow = {
  id: string;
  orderNumber: number;
  status: string;
  total: number;
  subtotal: number;
  createdAt: string;
  sentAt: string | null;
  notes: string | null;
  items: {
    id: string;
    name: string;
    unitPrice: number;
    modifierTotal: number;
    quantity: number;
    subtotal: number;
    notes: string | null;
    status: string;
    modifiers: { name: string; priceDelta: number }[];
  }[];
};

const ORDER_STATUS_LABEL: Record<string, string> = {
  draft: "Borrador",
  sent: "Enviada",
  received: "Recibida",
  preparing: "En preparación",
  ready: "Lista",
  delivered: "Servida",
  cancelled: "Cancelada",
  paid: "Pagada",
};

const ITEM_STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  preparing: "En cocina",
  ready: "Listo",
  served: "Servido",
  cancelled: "Cancelado",
};

const NEXT_ITEM_STATUS: Record<string, { status: "preparing" | "ready" | "served"; label: string }> = {
  pending: { status: "preparing", label: "Poner en cocina" },
  preparing: { status: "ready", label: "Marcar listo" },
  ready: { status: "served", label: "Servir" },
};

type Props = {
  sessions: SessionRow[];
  selected: SessionRow | null;
  orders: OrderRow[];
  total: number;
  categories: Category[];
  products: Product[];
  groupsByProduct: Record<string, ModifierGroup[]>;
  canCreate: boolean;
  canCancel: boolean;
  canCharge: boolean;
  canAdvance: boolean;
};

export default function PedidosView({
  sessions,
  selected,
  orders,
  total,
  categories,
  products,
  groupsByProduct,
  canCreate,
  canCancel,
  canCharge,
  canAdvance,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [target, setTarget] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [itemNotes, setItemNotes] = useState("");
  const [optionIds, setOptionIds] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const draftOrder = orders.find((order) => order.status === "draft") ?? null;
  const hasOrders = orders.length > 0;

  const visibleProducts = useMemo(
    () => (activeCategory ? products.filter((product) => product.category_id === activeCategory) : products),
    [products, activeCategory]
  );

  function run(task: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const result = await task();
      if (!result.ok) {
        setError(result.error ?? "No pudimos completar la operación.");
      } else {
        setError(null);
        router.refresh();
      }
    });
  }

  function openProduct(product: Product) {
    setTarget(product);
    setQuantity(1);
    setItemNotes("");
    setOptionIds([]);
  }

  function toggleOption(optionId: string) {
    setOptionIds((previous) =>
      previous.includes(optionId) ? previous.filter((id) => id !== optionId) : [...previous, optionId]
    );
  }

  function groupsFor(product: Product): ModifierGroup[] {
    return groupsByProduct[product.id] ?? [];
  }

  function validateSelection(product: Product): string | null {
    for (const group of groupsFor(product)) {
      const picked = group.options.filter((option) => optionIds.includes(option.id));
      if (group.required && group.min_select > 0 && picked.length < group.min_select) {
        return `Elegí al menos ${group.min_select} opción de "${group.name}".`;
      }
      if (group.max_select > 0 && picked.length > group.max_select) {
        return `"${group.name}" admite hasta ${group.max_select} opciones.`;
      }
      if (group.min_select > 0 && picked.length < group.min_select) {
        return `Elegí al menos ${group.min_select} opción de "${group.name}".`;
      }
    }
    return null;
  }

  function submitItem() {
    if (!target || !selected) return;
    const issue = validateSelection(target);
    if (issue) {
      setError(issue);
      return;
    }

    const payload = {
      items: [
        {
          product_id: target.id,
          quantity,
          notes: itemNotes,
          modifier_option_ids: optionIds,
        },
      ],
    };

    setTarget(null);
    run(() => (draftOrder ? addToOrder(draftOrder.id, payload) : startOrder(selected.id, payload)));
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pedidos</h1>
          <p className="text-sm text-muted-foreground">
            {sessions.length} mesa{sessions.length === 1 ? "" : "s"} abierta
            {sessions.length === 1 ? "" : "s"}
          </p>
        </div>
        <Button variant="outline" onClick={() => router.push("/mesas")}>
          Ir al salón
        </Button>
      </header>

      {sessions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {sessions.map((session) => (
            <Button
              key={session.id}
              size="sm"
              variant={selected?.id === session.id ? "default" : "outline"}
              onClick={() => router.push(`/pedidos?mesa=${session.tableId}`)}
            >
              {session.tableName}
              {session.status === "awaiting_payment" && <span className="ml-1.5">· a pagar</span>}
            </Button>
          ))}
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)]">
        <section className="space-y-4">
          {!selected ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
                <p className="text-sm text-muted-foreground">
                  {sessions.length === 0
                    ? "No hay mesas abiertas. Abrí una desde el salón para tomar pedidos."
                    : "Elegí una mesa arriba para ver su comanda."}
                </p>
                <Button variant="outline" onClick={() => router.push("/mesas")}>
                  Ir al salón
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base font-medium">{selected.tableName}</CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{minutesSince(selected.openedAt)} min</Badge>
                    <Badge variant={selected.status === "awaiting_payment" ? "destructive" : "secondary"}>
                      {selected.status === "awaiting_payment" ? "Esperando pago" : "Abierta"}
                    </Badge>
                  </div>
                </CardHeader>
              </Card>

              {orders.length === 0 ? (
                <Card>
                  <CardContent className="py-10 text-center text-sm text-muted-foreground">
                    Sin comandas. Agregá productos desde el catálogo.
                  </CardContent>
                </Card>
              ) : (
                orders.map((order) => (
                  <Card key={order.id}>
                    <CardHeader className="flex-row items-center justify-between space-y-0 border-b">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-sm font-semibold">
                          Comanda #{order.orderNumber}
                        </CardTitle>
                        <Badge variant="secondary">
                          {ORDER_STATUS_LABEL[order.status] ?? order.status}
                        </Badge>
                      </div>
                      <span className="text-sm font-semibold tabular-nums">
                        {formatMoney(order.total)}
                      </span>
                    </CardHeader>
                    <CardContent className="space-y-0 p-0">
                      {order.items.map((item) => {
                        const next = NEXT_ITEM_STATUS[item.status];
                        return (
                          <div
                            key={item.id}
                            className="flex items-start justify-between gap-3 border-b px-4 py-3 last:border-b-0"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-medium">
                                {item.quantity}× {item.name}
                              </p>
                              {item.modifiers.length > 0 && (
                                <p className="text-xs text-muted-foreground">
                                  {item.modifiers
                                    .map(
                                      (modifier) =>
                                        `${modifier.name}${modifier.priceDelta ? ` (+${formatMoney(modifier.priceDelta)})` : ""}`
                                    )
                                    .join(", ")}
                                </p>
                              )}
                              {item.notes && (
                                <p className="text-xs text-muted-foreground italic">{item.notes}</p>
                              )}
                              <div className="mt-1 flex items-center gap-2">
                                <Badge variant="outline" className="text-[11px]">
                                  {ITEM_STATUS_LABEL[item.status] ?? item.status}
                                </Badge>
                                <span className="text-xs text-muted-foreground tabular-nums">
                                  {formatMoney(item.subtotal)}
                                </span>
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                              {order.status === "draft" && canCreate && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  aria-label="Quitar"
                                  disabled={pending}
                                  onClick={() => run(() => removeOrderItem(item.id))}
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              )}
                              {canAdvance && next && order.status !== "draft" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={pending}
                                  onClick={() => run(() => advanceItem(item.id, next.status))}
                                >
                                  {next.label}
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                ))
              )}

              {hasOrders && (
                <Card>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Total de la mesa</p>
                      <p className="text-xl font-semibold tabular-nums">{formatMoney(total)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {canCancel && (
                        <Button
                          variant="ghost"
                          disabled={pending}
                          onClick={() => setCancelling(orders[orders.length - 1]?.id ?? null)}
                        >
                          <X className="size-4" /> Cancelar comanda
                        </Button>
                      )}
                      {draftOrder && canCreate && (
                        <Button
                          disabled={pending}
                          onClick={() => run(() => sendOrder(draftOrder.id))}
                        >
                          {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                          Enviar a cocina
                        </Button>
                      )}
                      {canCharge && (
                        <Button
                          render={<Link href={`/caja?mesa=${selected.tableId}`} />}
                          disabled={!!draftOrder}
                          title={draftOrder ? "Enviá la comanda antes de cobrar" : undefined}
                        >
                          Cobrar
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </section>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">Catálogo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  variant={activeCategory === null ? "default" : "outline"}
                  onClick={() => setActiveCategory(null)}
                >
                  Todo
                </Button>
                {categories.map((category) => (
                  <Button
                    key={category.id}
                    size="sm"
                    variant={activeCategory === category.id ? "default" : "outline"}
                    onClick={() => setActiveCategory(category.id)}
                  >
                    {category.icon} {category.name}
                  </Button>
                ))}
              </div>

              {products.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No hay productos disponibles. Cargá el catálogo primero.
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {visibleProducts.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      disabled={!selected || !canCreate || pending}
                      onClick={() => openProduct(product)}
                      className="rounded-lg border p-3 text-left transition-colors hover:border-primary/50 hover:bg-primary/5 disabled:opacity-50"
                    >
                      <p className="truncate text-sm font-medium">{product.name}</p>
                      <p className="text-sm text-muted-foreground tabular-nums">
                        {formatMoney(product.price)}
                      </p>
                    </button>
                  ))}
                </div>
              )}

              {!selected && products.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Seleccioná una mesa para agregar productos.
                </p>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>

      <Dialog open={target !== null} onOpenChange={(open) => !open && setTarget(null)}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto scroll-thin">
          <DialogHeader>
            <DialogTitle>{target?.name}</DialogTitle>
            <DialogDescription>
              {formatMoney(target?.price ?? 0)}
              {target?.description ? ` · ${target.description}` : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="item-quantity">Cantidad</Label>
              <Input
                id="item-quantity"
                type="number"
                min={1}
                max={99}
                value={quantity}
                onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))}
                className="w-24"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="item-notes">Observaciones</Label>
              <Input
                id="item-notes"
                value={itemNotes}
                maxLength={200}
                onChange={(event) => setItemNotes(event.target.value)}
                placeholder="Sin sal, bien cocido…"
              />
            </div>

            {target &&
              groupsFor(target).map((group) => (
                <div key={group.id} className="space-y-2">
                  <p className="text-sm font-medium">
                    {group.name}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      {group.required || group.min_select > 0 ? "obligatorio" : "opcional"}
                      {group.max_select > 0 ? ` · máx. ${group.max_select}` : ""}
                    </span>
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {group.options.map((option) => {
                      const active = optionIds.includes(option.id);
                      return (
                        <Button
                          key={option.id}
                          size="sm"
                          type="button"
                          variant={active ? "default" : "outline"}
                          onClick={() => toggleOption(option.id)}
                        >
                          {option.name}
                          {option.price_delta > 0 && ` +${formatMoney(option.price_delta)}`}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              ))}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setTarget(null)}>
              Cancelar
            </Button>
            <Button type="button" disabled={pending} onClick={submitItem}>
              <Plus className="size-4" /> Agregar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelling !== null} onOpenChange={(open) => !open && setCancelling(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar comanda</DialogTitle>
            <DialogDescription>
              Los ítems se marcarán como cancelados y no se podrán cobrar.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCancelling(null)}>
              Volver
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => {
                const id = cancelling;
                setCancelling(null);
                if (id) run(() => cancelOrder(id));
              }}
            >
              Cancelar comanda
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
