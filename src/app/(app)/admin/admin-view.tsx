"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Gift, Loader2, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteOrganization, grantFreeForever } from "@/app/(app)/admin/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type SubscriberRow = {
  orgId: string;
  orgName: string;
  registeredAt: string;
  ownerEmail: string | null;
  ownerName: string | null;
  status: string;
  plan: string | null;
  trialEnd: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  daysLeft: number | null;
  isFreeForever: boolean;
  memberCount: number;
  isSelf: boolean;
};

type Props = {
  rows: SubscriberRow[];
  loadError?: string | null;
};

type PendingAction = { kind: "grant" | "delete"; row: SubscriberRow };

const STATUS_LABELS: Record<string, string> = {
  none: "Sin suscripción",
  trial: "Prueba",
  active: "Activa",
  expired: "Vencida",
  suspended: "Suspendida",
  cancelled: "Cancelada",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function untilDate(row: SubscriberRow): string | null {
  if (row.daysLeft === null) return null;
  if (row.currentPeriodEnd && Date.parse(row.currentPeriodEnd) > Date.now()) return row.currentPeriodEnd;
  return row.trialEnd;
}

function statusBadge(row: SubscriberRow) {
  if (row.isFreeForever) return <Badge>Gratis</Badge>;
  if (row.status === "trial") return <Badge variant="secondary">Prueba</Badge>;
  if (row.status === "active") return <Badge variant="secondary">Activa</Badge>;
  if (row.status === "suspended" || row.status === "cancelled" || row.status === "expired") {
    return <Badge variant="destructive">{STATUS_LABELS[row.status] ?? row.status}</Badge>;
  }
  return <Badge variant="outline">{STATUS_LABELS[row.status] ?? row.status}</Badge>;
}

function daysBadge(row: SubscriberRow) {
  if (row.daysLeft === null) return <Badge variant="outline">Ilimitado</Badge>;
  if (row.daysLeft <= 0) return <Badge variant="destructive">Vencido</Badge>;
  if (row.daysLeft <= 3) return <Badge variant="destructive">{row.daysLeft} días</Badge>;
  return <Badge variant="secondary">{row.daysLeft} días</Badge>;
}

export default function AdminView({ rows, loadError }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<PendingAction | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (row) =>
        row.orgName.toLowerCase().includes(needle) ||
        (row.ownerEmail ?? "").toLowerCase().includes(needle) ||
        (row.ownerName ?? "").toLowerCase().includes(needle)
    );
  }, [query, rows]);

  const stats = useMemo(
    () => ({
      total: rows.length,
      trial: rows.filter((row) => row.status === "trial").length,
      active: rows.filter((row) => row.status === "active").length,
      soon: rows.filter((row) => row.daysLeft !== null && row.daysLeft > 0 && row.daysLeft <= 3).length,
    }),
    [rows]
  );

  function run(task: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const result = await task();
      if (!result.ok) {
        setError(result.error ?? "No pudimos completar la operación.");
        setTarget(null);
        return;
      }
      setError(null);
      setTarget(null);
      toast.success(success);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Admin de suscriptores</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} organización{rows.length === 1 ? "" : "es"} registrada{rows.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por organización o email"
            className="w-full min-w-64 pl-9 sm:w-72"
          />
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Suscriptores", value: stats.total },
          { label: "En prueba", value: stats.trial },
          { label: "Activas", value: stats.active },
          { label: "Vencen en 3 días", value: stats.soon },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="px-4 py-3">
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className="text-xl font-semibold tabular-nums">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {(loadError || error) && (
        <Alert variant="destructive">
          <AlertDescription>{loadError ?? error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organización</TableHead>
                <TableHead>Responsable</TableHead>
                <TableHead>Registrado</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Días restantes</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-sm text-muted-foreground">
                    {rows.length === 0 ? "Todavía no hay organizaciones registradas." : "Sin resultados para esa búsqueda."}
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((row) => (
                <TableRow key={row.orgId}>
                  <TableCell>
                    <p className="font-medium">
                      {row.orgName}
                      {row.isSelf && (
                        <Badge variant="outline" className="ml-2">
                          Tu organización
                        </Badge>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">{row.memberCount} usuario{row.memberCount === 1 ? "" : "s"}</p>
                  </TableCell>
                  <TableCell>
                    <p className="text-sm">{row.ownerEmail ?? "Email no disponible"}</p>
                    {row.ownerName && <p className="text-xs text-muted-foreground">{row.ownerName}</p>}
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">{formatDate(row.registeredAt)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {statusBadge(row)}
                      {row.plan && !row.isFreeForever && <Badge variant="outline">{row.plan}</Badge>}
                      {row.cancelAtPeriodEnd && <Badge variant="outline">No renueva</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      {daysBadge(row)}
                      {untilDate(row) && (
                        <span className="text-xs text-muted-foreground">hasta {formatDate(untilDate(row) as string)}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      {!row.isFreeForever && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() => setTarget({ kind: "grant", row })}
                        >
                          <Gift className="size-4" /> Gratis para siempre
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={pending || row.isSelf}
                        title={row.isSelf ? "No podés eliminar tu propia organización." : undefined}
                        onClick={() => setTarget({ kind: "delete", row })}
                      >
                        <Trash2 className="size-4" />
                        <span className="sr-only">Eliminar</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={target !== null} onOpenChange={(open) => !open && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {target?.kind === "delete" ? "Eliminar organización" : "Dar gratis para siempre"}
            </DialogTitle>
            <DialogDescription>
              {target?.kind === "delete" ? (
                <>
                  Se elimina <strong>{target?.row.orgName}</strong> y todos sus datos: mesas, productos, pedidos,
                  ventas y caja. Las cuentas que solo pertenecían a esa organización también se eliminan. Esta
                  acción no se puede deshacer.
                </>
              ) : (
                <>
                  <strong>{target?.row.orgName}</strong> pasará a tener suscripción activa sin vencimiento ni
                  cobro. Podés revertirlo editando la suscripción en la base.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="ghost" disabled={pending} onClick={() => setTarget(null)}>
              Cancelar
            </Button>
            <Button
              variant={target?.kind === "delete" ? "destructive" : "default"}
              disabled={pending}
              onClick={() => {
                if (!target) return;
                if (target.kind === "grant") {
                  run(() => grantFreeForever(target.row.orgId), "Suscripción liberada para siempre.");
                } else {
                  run(() => deleteOrganization(target.row.orgId), "Organización eliminada.");
                }
              }}
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              {target?.kind === "delete" ? "Eliminar definitivamente" : "Liberar suscripción"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
