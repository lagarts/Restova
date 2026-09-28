"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, Pencil, Plus, Trash2, Users } from "lucide-react";
import {
  deleteTable,
  getTableDetail,
  listWaiters,
  markSessionAwaitingPayment,
  moveTable,
  openTableSession,
  saveTable,
  type TableDetail,
} from "@/app/(app)/mesas/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Skeleton } from "@/components/ui/skeleton";
import { CELL_HEIGHT, GRID_COLUMNS } from "@/lib/validation/floor";
import { formatMoney, formatTime } from "@/lib/utils/date";
import type { DiningTable } from "@/types/domain";

export type TableStatus =
  | "free"
  | "open"
  | "ordered"
  | "preparing"
  | "ready"
  | "awaiting_payment";

type SessionInfo = {
  session: {
    id: string;
    status: "open" | "awaiting_payment" | "closed";
    opened_at: string;
    waiter_id: string | null;
    guest_count: number | null;
  };
  status: TableStatus;
};

const STATUS_LABEL: Record<TableStatus, string> = {
  free: "Libre",
  open: "Ocupada",
  ordered: "Pedido enviado",
  preparing: "En preparación",
  ready: "Listo",
  awaiting_payment: "Esperando pago",
};

const STATUS_CLASS: Record<TableStatus, string> = {
  free: "border-border bg-card text-foreground",
  open: "border-primary/40 bg-primary/10 text-primary",
  ordered: "border-info/40 bg-info/10 text-info",
  preparing: "border-warning/50 bg-warning/15 text-warning",
  ready: "border-success/50 bg-success/15 text-success",
  awaiting_payment: "border-destructive/40 bg-destructive/10 text-destructive",
};

type Props = {
  tables: DiningTable[];
  sessionByTable: Map<string, SessionInfo>;
  canManage: boolean;
  canOpen: boolean;
  canOperate: boolean;
};

type Geometry = Pick<DiningTable, "pos_x" | "pos_y" | "width" | "height">;

type FormInitial = Geometry & {
  name: string;
  capacity: number;
  sector: string;
};

export default function MesasView({
  tables,
  sessionByTable,
  canManage,
  canOpen,
  canOperate,
}: Props) {
  const [geometry, setGeometry] = useState<Record<string, Geometry>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dragRef = useRef<
    | {
        id: string;
        mode: "move" | "resize";
        startX: number;
        startY: number;
        origin: Geometry;
        cellW: number;
        next: Geometry | null;
      }
    | null
  >(null);
  const suppressClickRef = useRef(false);

  const resolve = useCallback(
    (table: DiningTable): Geometry => geometry[table.id] ?? table,
    [geometry]
  );

  const sectors = new Map<string, DiningTable[]>();
  for (const table of tables) {
    const list = sectors.get(table.sector) ?? [];
    list.push(table);
    sectors.set(table.sector, list);
  }

  const occupiedRows = tables.length
    ? Math.max(...tables.map((table) => {
        const geo = resolve(table);
        return geo.pos_y + geo.height;
      }))
    : 0;

  const formInitial: FormInitial | null = creating
    ? {
        name: `Mesa ${tables.length + 1}`,
        capacity: 4,
        sector: [...sectors.keys()][0] ?? "Salón",
        pos_x: 0,
        pos_y: occupiedRows,
        width: 2,
        height: 1,
      }
    : editingId
      ? (() => {
          const table = tables.find((candidate) => candidate.id === editingId);
          return table ? { ...table, ...resolve(table) } : null;
        })()
      : null;

  function onPointerDown(
    event: React.PointerEvent<HTMLElement>,
    table: DiningTable,
    mode: "move" | "resize"
  ) {
    suppressClickRef.current = mode === "resize";
    if (!canManage) return;
    const canvas = event.currentTarget.closest("[data-canvas]") as HTMLElement | null;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    dragRef.current = {
      id: table.id,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      origin: resolve(table),
      cellW: rect.width / GRID_COLUMNS,
      next: null,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag) return;

    if (Math.abs(event.clientX - drag.startX) > 4 || Math.abs(event.clientY - drag.startY) > 4) {
      suppressClickRef.current = true;
    }

    const dx = Math.round((event.clientX - drag.startX) / drag.cellW);
    const dy = Math.round((event.clientY - drag.startY) / CELL_HEIGHT);
    const origin = drag.origin;

    const next: Geometry =
      drag.mode === "move"
        ? {
            ...origin,
            pos_x: clamp(origin.pos_x + dx, 0, GRID_COLUMNS - origin.width),
            pos_y: clamp(origin.pos_y + dy, 0, 60),
          }
        : {
            ...origin,
            width: clamp(origin.width + dx, 1, GRID_COLUMNS - origin.pos_x),
            height: clamp(origin.height + dy, 1, 4),
          };

    dragRef.current = { ...drag, next };
    setGeometry((previous) => ({ ...previous, [drag.id]: next }));
  }

  function onPointerUp() {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag?.next) return;
    const next = drag.next;
    startTransition(async () => {
      const result = await moveTable(drag.id, next);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mapa de mesas</h1>
          <p className="text-sm text-muted-foreground">
            {tables.length} mesa{tables.length === 1 ? "" : "s"} · {sectors.size} sector
            {sectors.size === 1 ? "" : "s"}
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" /> Nueva mesa
          </Button>
        )}
      </header>

      {!canOperate && (
        <Alert>
          <AlertTitle>Suscripción vencida</AlertTitle>
          <AlertDescription>No podés abrir mesas ni tomar pedidos hasta activarla.</AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {(Object.keys(STATUS_LABEL) as TableStatus[]).map((status) => (
          <span key={status} className="flex items-center gap-1.5">
            <span
              className={`size-2.5 rounded-full border ${STATUS_CLASS[status].replace(/bg-\S+|text-\S+/g, "").trim()}`}
            />
            {STATUS_LABEL[status]}
          </span>
        ))}
      </div>

      {tables.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <Users className="size-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              Todavía no hay mesas. Creá la primera para empezar a operar.
            </p>
            {canManage && (
              <Button onClick={() => setCreating(true)}>
                <Plus className="size-4" /> Nueva mesa
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {[...sectors.entries()].map(([sector, items]) => {
            const rows = Math.max(
              3,
              ...items.map((table) => {
                const geo = resolve(table);
                return geo.pos_y + geo.height;
              })
            );
            return (
              <Card key={sector}>
                <CardHeader>
                  <CardTitle className="text-base font-medium">{sector}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div
                    data-canvas
                    className="relative w-full touch-none rounded-lg bg-muted/40"
                    style={{ height: rows * CELL_HEIGHT }}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                  >
                    {items.map((table) => {
                      const geo = resolve(table);
                      const info = sessionByTable.get(table.id);
                      const status: TableStatus = info ? info.status : "free";
                      return (
                        <div
                          key={table.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            if (suppressClickRef.current) {
                              suppressClickRef.current = false;
                              return;
                            }
                            setSelectedId(table.id);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") setSelectedId(table.id);
                          }}
                          onPointerDown={(event) => onPointerDown(event, table, "move")}
                          style={{
                            left: `${(geo.pos_x / GRID_COLUMNS) * 100}%`,
                            top: geo.pos_y * CELL_HEIGHT,
                            width: `calc(${(geo.width / GRID_COLUMNS) * 100}% - 6px)`,
                            height: geo.height * CELL_HEIGHT - 6,
                          }}
                          className={`absolute cursor-pointer rounded-xl border-2 p-2 text-left shadow-sm transition-colors ${STATUS_CLASS[status]}`}
                        >
                          <p className="truncate text-sm font-semibold">{table.name}</p>
                          <p className="text-xs opacity-80">
                            {STATUS_LABEL[status]} · {table.capacity}p
                          </p>
                          {info && (
                            <p className="absolute right-2 bottom-1.5 text-[10px] opacity-70">
                              {formatTime(info.session.opened_at)}
                            </p>
                          )}
                          {canManage && (
                            <span
                              onPointerDown={(event) => {
                                event.stopPropagation();
                                onPointerDown(event, table, "resize");
                              }}
                              className="absolute right-0 bottom-0 size-4 cursor-nwse-resize rounded-br-xl border-l-2 border-t-2 border-current opacity-40"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <TableDetailDialog
        tableId={selectedId}
        table={tables.find((t) => t.id === selectedId) ?? null}
        canManage={canManage}
        canOpen={canOpen}
        onEdit={(id) => {
          setSelectedId(null);
          setEditingId(id);
        }}
        onClose={() => setSelectedId(null)}
        onError={setError}
      />

      <TableFormDialog
        key={editingId ?? "new-table"}
        initial={formInitial}
        creating={creating}
        sectors={[...sectors.keys()]}
        pending={pending}
        onClose={() => {
          setEditingId(null);
          setCreating(false);
        }}
        onSubmit={(formData) => {
          startTransition(async () => {
            const result = await saveTable(editingId, formData);
            if (result.ok) {
              setEditingId(null);
              setCreating(false);
              setError(null);
            } else {
              setError(result.error);
            }
          });
        }}
        onDelete={
          editingId
            ? () =>
                startTransition(async () => {
                  const result = await deleteTable(editingId);
                  if (result.ok) setEditingId(null);
                  else setError(result.error);
                })
            : undefined
        }
      />
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function TableDetailDialog({
  tableId,
  table,
  canManage,
  canOpen,
  onEdit,
  onClose,
  onError,
}: {
  tableId: string | null;
  table: DiningTable | null;
  canManage: boolean;
  canOpen: boolean;
  onEdit: (id: string) => void;
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const [detail, setDetail] = useState<{ tableId: string; data: TableDetail } | null>(null);
  const [waiters, setWaiters] = useState<{ id: string; name: string }[]>([]);
  const [waiterId, setWaiterId] = useState("");
  const [loading, startLoading] = useTransition();

  useEffect(() => {
    if (!tableId) return;
    startLoading(async () => {
      const [detailResult, waiterList] = await Promise.all([
        getTableDetail(tableId),
        canOpen ? listWaiters() : Promise.resolve([]),
      ]);
      if ("error" in detailResult) {
        onError(detailResult.error);
        return;
      }
      setDetail({ tableId, data: detailResult });
      setWaiters(waiterList);
      setWaiterId(waiterList[0]?.id ?? "");
    });
  }, [tableId, canOpen, onError]);

  const [opening, startOpening] = useTransition();

  if (!tableId || !table) return null;

  const session = detail?.tableId === tableId ? (detail.data.session ?? null) : null;
  const current = detail?.tableId === tableId ? detail.data : null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto scroll-thin">
        <DialogHeader>
          <DialogTitle>{table.name}</DialogTitle>
          <DialogDescription>
            {table.sector} · Capacidad {table.capacity}
            {current ? ` · Abierta hace ${current.minutes} min` : ""}
          </DialogDescription>
        </DialogHeader>

        {loading && !current && (
          <div className="space-y-2">
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-5 w-1/3" />
          </div>
        )}

        {!loading && current && !session && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">La mesa está libre.</p>
            {canOpen ? (
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-2">
                  <Label htmlFor="waiter">Mozo</Label>
                  <select
                    id="waiter"
                    value={waiterId}
                    onChange={(event) => setWaiterId(event.target.value)}
                    className="flex h-9 w-full min-w-40 rounded-lg border border-input bg-background px-3 text-sm"
                  >
                    {waiters.map((waiter) => (
                      <option key={waiter.id} value={waiter.id}>
                        {waiter.name}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  disabled={opening}
                  onClick={() =>
                    startOpening(async () => {
                      const result = await openTableSession(tableId, waiterId || null);
                      if (result.ok) onClose();
                      else onError(result.error);
                    })
                  }
                >
                  {opening && <Loader2 className="size-4 animate-spin" />}
                  Abrir mesa
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Sin permisos para abrir mesas.</p>
            )}
          </div>
        )}

        {current && session && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                {session.status === "awaiting_payment" ? "Esperando pago" : "Mesa abierta"}
              </Badge>
              {current.session?.waiter_name && (
                <Badge variant="outline">Mozo: {current.session.waiter_name}</Badge>
              )}
              <Badge variant="outline">{current.minutes} min</Badge>
            </div>

            {current.orders.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin pedidos cargados.</p>
            ) : (
              current.orders.map((order) => (
                <div key={order.id} className="rounded-lg border">
                  <div className="flex items-center justify-between border-b px-3 py-2 text-sm">
                    <span className="font-medium">Comanda #{order.order_number}</span>
                    <span className="text-xs text-muted-foreground">{order.status}</span>
                  </div>
                  <ul className="divide-y px-3">
                    {order.items.map((item, index) => (
                      <li key={index} className="flex justify-between py-2 text-sm">
                        <span>
                          {item.quantity}× {item.name}
                          {item.notes && (
                            <span className="block text-xs text-muted-foreground">{item.notes}</span>
                          )}
                        </span>
                        <span className="tabular-nums">{formatMoney(item.subtotal)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}

            <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2.5">
              <span className="text-sm font-medium">Total</span>
              <span className="text-lg font-semibold tabular-nums">{formatMoney(current.total)}</span>
            </div>

            <DialogFooter className="flex-wrap gap-2 sm:justify-between">
              <div className="flex gap-2">
                {canManage && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      onEdit(table.id);
                    }}
                  >
                    <Pencil className="size-4" /> Editar
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                {canOpen && session.status !== "awaiting_payment" && (
                  <Button
                    variant="outline"
                    disabled={opening}
                    onClick={() =>
                      startOpening(async () => {
                        const result = await markSessionAwaitingPayment(session.id);
                        if (!result.ok) onError(result.error);
                      })
                    }
                  >
                    Esperando pago
                  </Button>
                )}
                <Button render={<Link href="/pedidos" />}>Ir a pedidos</Button>
              </div>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TableFormDialog({
  initial,
  creating,
  sectors,
  pending,
  onClose,
  onSubmit,
  onDelete,
}: {
  initial: FormInitial | null;
  creating: boolean;
  sectors: string[];
  pending: boolean;
  onClose: () => void;
  onSubmit: (formData: FormData) => void;
  onDelete?: () => void;
}) {
  const open = creating || initial !== null;
  if (!open || !initial) return null;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{creating ? "Nueva mesa" : "Editar mesa"}</DialogTitle>
          <DialogDescription>Definí cómo se ve en el salón.</DialogDescription>
        </DialogHeader>
        <form action={onSubmit} className="space-y-4">
          <input type="hidden" name="pos_x" value={initial.pos_x} />
          <input type="hidden" name="pos_y" value={initial.pos_y} />
          <input type="hidden" name="width" value={initial.width} />
          <input type="hidden" name="height" value={initial.height} />
          <div className="space-y-2">
            <Label htmlFor="table-name">Nombre / número *</Label>
            <Input id="table-name" name="name" defaultValue={initial.name} required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="table-capacity">Capacidad *</Label>
              <Input
                id="table-capacity"
                name="capacity"
                defaultValue={String(initial.capacity)}
                inputMode="numeric"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="table-sector">Sector *</Label>
              <Input
                id="table-sector"
                name="sector"
                defaultValue={initial.sector}
                list="sector-list"
              />
              <datalist id="sector-list">
                {sectors.map((sector) => (
                  <option key={sector} value={sector} />
                ))}
              </datalist>
            </div>
          </div>
          <DialogFooter>
            {onDelete && (
              <Button type="button" variant="ghost" onClick={onDelete} disabled={pending}>
                <Trash2 className="size-4" /> Eliminar
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />} Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
