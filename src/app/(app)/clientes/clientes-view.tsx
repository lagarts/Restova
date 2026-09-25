"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import { deleteCustomer, saveCustomer } from "@/app/(app)/clientes/actions";
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
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/utils/date";
import type { Customer } from "@/types/domain";

type Props = {
  customers: Customer[];
  search: string;
  canManage: boolean;
  canDelete: boolean;
};

export default function ClientesView({ customers, search, canManage, canDelete }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState(search);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<Customer | null>(null);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<Customer | null>(null);

  const open = creating || editing !== null;

  function run(task: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const result = await task();
      if (!result.ok) {
        setError(result.error ?? "No pudimos completar la operación.");
      } else {
        setError(null);
        setEditing(null);
        setCreating(false);
        setRemoving(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
          <p className="text-sm text-muted-foreground">
            {customers.length} cliente{customers.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <form
            className="relative"
            onSubmit={(event) => {
              event.preventDefault();
              router.push(query.trim() ? `/clientes?q=${encodeURIComponent(query.trim())}` : "/clientes");
            }}
          >
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por nombre o teléfono"
              className="w-64 pl-8"
            />
          </form>
          {canManage && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" /> Nuevo
            </Button>
          )}
        </div>
      </header>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="p-0">
          {customers.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-14 text-center">
              <Users className="size-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                {search ? "Sin resultados para esa búsqueda." : "Todavía no hay clientes cargados."}
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {customers.map((customer) => (
                <li key={customer.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{customer.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {[
                        customer.phone,
                        customer.email,
                        customer.address,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Sin datos de contacto"}
                    </p>
                    {customer.notes && (
                      <p className="text-xs text-muted-foreground italic">{customer.notes}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <div className="text-right">
                      <Badge variant="secondary">
                        {customer.orders_count} pedido{customer.orders_count === 1 ? "" : "s"}
                      </Badge>
                      <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                        {formatMoney(customer.total_spent)}
                      </p>
                    </div>
                    {canManage && (
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Editar"
                          onClick={() => setEditing(customer)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        {canDelete && (
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Eliminar"
                            onClick={() => setRemoving(customer)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) {
            setEditing(null);
            setCreating(false);
          }
        }}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto scroll-thin">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar cliente" : "Nuevo cliente"}</DialogTitle>
            <DialogDescription>Se guarda a nivel negocio, no por sucursal.</DialogDescription>
          </DialogHeader>
          <form
            action={(formData) => run(() => saveCustomer(editing?.id ?? null, formData))}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="customer-name">Nombre *</Label>
              <Input id="customer-name" name="name" defaultValue={editing?.name ?? ""} required />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="customer-phone">Teléfono</Label>
                <Input id="customer-phone" name="phone" defaultValue={editing?.phone ?? ""} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customer-email">Email</Label>
                <Input
                  id="customer-email"
                  name="email"
                  type="email"
                  defaultValue={editing?.email ?? ""}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer-address">Dirección</Label>
              <Input
                id="customer-address"
                name="address"
                defaultValue={editing?.address ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer-notes">Observaciones</Label>
              <Input id="customer-notes" name="notes" defaultValue={editing?.notes ?? ""} />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setEditing(null);
                  setCreating(false);
                }}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="size-4 animate-spin" />} Guardar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={removing !== null} onOpenChange={(next) => !next && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar cliente</DialogTitle>
            <DialogDescription>
              {removing?.name} dejará de aparecer en el listado.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => {
                const target = removing;
                setRemoving(null);
                if (target) run(() => deleteCustomer(target.id));
              }}
            >
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
