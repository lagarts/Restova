"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Minus, Plus, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import { chargeSession, closeRegister, openRegister } from "@/app/(app)/caja/actions";
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
import {
  PAYMENT_LABELS,
  PAYMENT_METHODS,
  type PaymentMethod,
} from "@/lib/validation/cash";
import { formatMoney, formatTime, minutesSince } from "@/lib/utils/date";

export type RegisterRow = {
  id: string;
  opening_amount: number;
  opened_at: string;
  opened_by: string;
  notes: string | null;
  status: "open" | "closed";
};

export type MovementRow = {
  id: string;
  type: string;
  method: string;
  amount: number;
  concept: string;
  created_at: string;
};

export type CheckoutInfo = {
  sessionId: string;
  tableName: string;
  openedAt: string;
  hasDraft: boolean;
  orders: { orderNumber: number; status: string; total: number }[];
  total: number;
};

const MOVEMENT_LABEL: Record<string, string> = {
  opening: "Apertura",
  sale: "Venta",
  income: "Ingreso",
  expense: "Egreso",
  refund: "Reembolso",
  withdrawal: "Retiro",
  adjustment: "Ajuste",
  closing: "Cierre",
};

type Props = {
  register: RegisterRow | null;
  movements: MovementRow[];
  checkout: CheckoutInfo | null;
  canOpen: boolean;
  canClose: boolean;
  canCharge: boolean;
  canOperate: boolean;
  branchName: string;
};

type Payment = { method: PaymentMethod; amount: string };

export default function CajaView({
  register,
  movements,
  checkout,
  canOpen,
  canClose,
  canCharge,
  canOperate,
  branchName,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [closing, setClosing] = useState(false);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [discount, setDiscount] = useState("0");
  const [receipt, setReceipt] = useState<string | null>(null);

  const sold = movements
    .filter((movement) => movement.type === "sale")
    .reduce((sum, movement) => sum + movement.amount, 0);
  const cash = movements
    .filter((movement) => movement.type === "sale" && movement.method === "cash")
    .reduce((sum, movement) => sum + movement.amount, 0);
  const others = sold - cash;
  const expenses = movements
    .filter((movement) => ["expense", "withdrawal"].includes(movement.type))
    .reduce((sum, movement) => sum + movement.amount, 0);
  const cashBalance =
    (register ? Number(register.opening_amount) : 0) +
    movements
      .filter((movement) => movement.method === "cash")
      .reduce((sum, movement) => sum + movement.amount, 0);

  const discountValue = Math.max(0, Number(discount) || 0);
  const payable = Math.max(0, (checkout?.total ?? 0) - discountValue);
  const paid = payments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
  const remaining = Math.max(0, payable - paid);

  function run(task: () => Promise<{ ok: boolean; error?: string; data?: unknown }>) {
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

  function addPayment(method: PaymentMethod, amount: number) {
    if (amount <= 0) return;
    setPayments((previous) => [
      ...previous,
      { method, amount: amount.toFixed(2) },
    ]);
  }

  function submitCharge() {
    if (!checkout) return;
    setReceipt(null);
    const clean = payments
      .map((payment) => ({ method: payment.method, amount: Number(payment.amount) }))
      .filter((payment) => payment.amount > 0);

    const sum = clean.reduce((total, payment) => total + payment.amount, 0);
    if (clean.length === 0 || Math.abs(sum - payable) > 0.01) {
      setError("Los pagos deben sumar exactamente el total a cobrar.");
      return;
    }

    const sessionId = checkout.sessionId;
    startTransition(async () => {
      const result = await chargeSession(sessionId, {
        payments: clean,
        discount_amount: discountValue,
      });
      if (!result.ok) {
        setError(result.error ?? "No pudimos cobrar la mesa.");
        return;
      }
      setError(null);
      setPayments([]);
      setDiscount("0");
      setReceipt("Venta registrada correctamente.");
      toast.success("Mesa cobrada");
      router.push("/caja");
    });
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Caja</h1>
          <p className="text-sm text-muted-foreground">{branchName}</p>
        </div>
        <Badge variant={register ? "secondary" : "outline"}>
          {register ? "Caja abierta" : "Caja cerrada"}
        </Badge>
      </header>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {receipt && (
        <Alert>
          <AlertTitle>Listo</AlertTitle>
          <AlertDescription>{receipt}</AlertDescription>
        </Alert>
      )}

      {!canOperate && (
        <Alert>
          <AlertTitle>Suscripción vencida</AlertTitle>
          <AlertDescription>No se puede operar la caja hasta que se reactive.</AlertDescription>
        </Alert>
      )}

      {!register ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">Abrir caja</CardTitle>
          </CardHeader>
          <CardContent>
            {canOpen ? (
              <form
                action={(formData) => run(() => openRegister(formData))}
                className="flex flex-wrap items-end gap-3"
              >
                <div className="space-y-2">
                  <Label htmlFor="opening_amount">Fondo inicial *</Label>
                  <Input
                    id="opening_amount"
                    name="opening_amount"
                    defaultValue="0"
                    inputMode="decimal"
                    className="w-40"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="open-notes">Observaciones</Label>
                  <Input id="open-notes" name="notes" className="w-64" />
                </div>
                <Button type="submit" disabled={pending}>
                  {pending && <Loader2 className="size-4 animate-spin" />} Abrir caja
                </Button>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">Tu rol no puede abrir la caja.</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)]">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="Fondo inicial" value={formatMoney(Number(register.opening_amount))} />
              <Stat label="Ventas" value={formatMoney(sold)} />
              <Stat label="Efectivo" value={formatMoney(cash)} />
              <Stat label="Otros medios" value={formatMoney(others)} />
            </div>

            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base font-medium">Movimientos del turno</CardTitle>
                <span className="text-sm text-muted-foreground">
                  Abierta {formatTime(register.opened_at)} · {minutesSince(register.opened_at)} min
                </span>
              </CardHeader>
              <CardContent className="p-0">
                {movements.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Sin movimientos todavía.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {movements.map((movement) => (
                      <li
                        key={movement.id}
                        className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {movement.concept || MOVEMENT_LABEL[movement.type] || movement.type}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatTime(movement.created_at)} ·{" "}
                            {PAYMENT_LABELS[movement.method as PaymentMethod] ?? movement.method}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 tabular-nums ${movement.amount < 0 ? "text-destructive" : ""}`}
                        >
                          {formatMoney(movement.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <aside className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-medium">Cierre</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <Row label="Efectivo esperado" value={formatMoney(cashBalance)} />
                <Row label="Egresos" value={formatMoney(expenses)} />
                <Button
                  className="w-full"
                  variant="outline"
                  disabled={!canClose || pending}
                  onClick={() => setClosing(true)}
                >
                  <Wallet className="size-4" /> Cerrar caja
                </Button>
              </CardContent>
            </Card>

            {checkout && canCharge && (
              <Card>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base font-medium">
                    Cobrar {checkout.tableName}
                  </CardTitle>
                  <Button size="icon" variant="ghost" onClick={() => router.push("/caja")}>
                    <X className="size-4" />
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-xs text-muted-foreground">
                    Abierta hace {minutesSince(checkout.openedAt)} min ·{" "}
                    {checkout.orders.length} comanda{checkout.orders.length === 1 ? "" : "s"}
                  </p>

                  <ul className="space-y-1 text-sm">
                    {checkout.orders.map((order) => (
                      <li key={order.orderNumber} className="flex justify-between">
                        <span>
                          Comanda #{order.orderNumber}
                          {order.status === "draft" && (
                            <span className="ml-1 text-xs text-warning">· sin enviar</span>
                          )}
                        </span>
                        <span className="tabular-nums">{formatMoney(order.total)}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="space-y-2">
                    <Label htmlFor="discount">Descuento</Label>
                    <Input
                      id="discount"
                      inputMode="decimal"
                      value={discount}
                      onChange={(event) => setDiscount(event.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>A pagar</span>
                      <span className="font-semibold tabular-nums">{formatMoney(payable)}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {PAYMENT_METHODS.map((method) => (
                        <Button
                          key={method}
                          size="sm"
                          variant="outline"
                          onClick={() => addPayment(method, remaining || payable)}
                        >
                          <Plus className="size-3" /> {PAYMENT_LABELS[method]}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {payments.length > 0 && (
                    <div className="space-y-2">
                      {payments.map((payment, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <span className="w-28 shrink-0 text-sm">{PAYMENT_LABELS[payment.method]}</span>
                          <Input
                            inputMode="decimal"
                            value={payment.amount}
                            onChange={(event) =>
                              setPayments((previous) =>
                                previous.map((item, i) =>
                                  i === index ? { ...item, amount: event.target.value } : item
                                )
                              )
                            }
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() =>
                              setPayments((previous) => previous.filter((_, i) => i !== index))
                            }
                          >
                            <Minus className="size-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-sm">
                    <span>Suma de pagos</span>
                    <span className="tabular-nums">
                      {formatMoney(paid)}{" "}
                      <span className={remaining > 0 ? "text-destructive" : "text-success"}>
                        {remaining > 0 ? `· falta ${formatMoney(remaining)}` : "· completo"}
                      </span>
                    </span>
                  </div>

                  <Button
                    className="w-full"
                    disabled={pending || checkout.hasDraft || !canOperate}
                    onClick={submitCharge}
                    title={checkout.hasDraft ? "Hay comandas sin enviar" : undefined}
                  >
                    {pending && <Loader2 className="size-4 animate-spin" />} Cobrar{" "}
                    {formatMoney(payable)}
                  </Button>

                  {checkout.hasDraft && (
                    <p className="text-xs text-destructive">
                      Hay comandas en borrador: envialas a cocina antes de cobrar.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {!checkout && (
              <p className="text-sm text-muted-foreground">
                Seleccioná una mesa desde Pedidos con el botón &ldquo;Cobrar&rdquo; para facturarla
                acá.
              </p>
            )}
          </aside>
        </div>
      )}

      <Dialog open={closing} onOpenChange={setClosing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cerrar caja</DialogTitle>
            <DialogDescription>
              Ingresá el efectivo contado. La diferencia se calcula contra el esperado.
            </DialogDescription>
          </DialogHeader>
          <form
            action={(formData) => {
              setClosing(false);
              run(() => closeRegister(formData));
            }}
            className="space-y-4"
          >
            <input type="hidden" name="register_id" value={register?.id ?? ""} />
            <div className="space-y-2">
              <Label htmlFor="declared_amount">Efectivo contado *</Label>
              <Input id="declared_amount" name="declared_amount" inputMode="decimal" required />
              <p className="text-xs text-muted-foreground">
                Esperado: {formatMoney(cashBalance)}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="close-notes">Observaciones</Label>
              <Input id="close-notes" name="notes" />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setClosing(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="size-4 animate-spin" />} Cerrar caja
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
