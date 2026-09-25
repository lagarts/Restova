"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, Loader2, MapPin, Plus } from "lucide-react";
import {
  saveBranch,
  updateOrganization,
  useBranch as switchBranch,
} from "@/app/(app)/configuracion/actions";
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
import { ROLE_LABELS, type Role } from "@/lib/auth/rbac";
import type { Branch, Organization } from "@/types/domain";

type Props = {
  org: Organization;
  branches: Branch[];
  activeBranchId: string;
  canManageOrg: boolean;
  canManageBranch: boolean;
  role: Role;
};

export default function ConfiguracionView({
  org,
  branches,
  activeBranchId,
  canManageOrg,
  canManageBranch,
  role,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [creatingBranch, setCreatingBranch] = useState(false);

  function run(task: () => Promise<{ ok: boolean; error?: string }>, success?: string) {
    startTransition(async () => {
      const result = await task();
      if (!result.ok) {
        setError(result.error ?? "No pudimos guardar los cambios.");
        setOk(null);
      } else {
        setError(null);
        setOk(success ?? "Guardado.");
        setEditingBranch(null);
        setCreatingBranch(false);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Configuración</h1>
        <p className="text-sm text-muted-foreground">
          {org.name} · Tu rol: {ROLE_LABELS[role]}
        </p>
      </header>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {ok && (
        <Alert>
          <AlertTitle>Listo</AlertTitle>
          <AlertDescription>{ok}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="flex-row items-center gap-2 space-y-0">
          <Building2 className="size-4" />
          <CardTitle className="text-base font-medium">Negocio</CardTitle>
        </CardHeader>
        <CardContent>
          {canManageOrg ? (
            <form
              action={(formData) => run(() => updateOrganization(formData), "Negocio actualizado.")}
              className="space-y-4"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="name" label="Nombre *" defaultValue={org.name} />
                <Field id="legal_name" label="Razón social" defaultValue={org.legal_name ?? ""} />
                <Field id="tax_id" label="CUIT / Tax ID" defaultValue={org.tax_id ?? ""} />
                <Field id="email" label="Email" type="email" defaultValue={org.email ?? ""} />
                <Field id="phone" label="Teléfono" defaultValue={org.phone ?? ""} />
                <Field id="address" label="Dirección" defaultValue={org.address ?? ""} />
              </div>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="size-4 animate-spin" />} Guardar negocio
              </Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              Solo el administrador puede editar estos datos.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2">
            <MapPin className="size-4" />
            <CardTitle className="text-base font-medium">Sucursales</CardTitle>
          </div>
          {canManageBranch && (
            <Button size="sm" variant="outline" onClick={() => setCreatingBranch(true)}>
              <Plus className="size-4" /> Nueva
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-2 p-4">
          {branches.map((branch) => (
            <div
              key={branch.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium">
                  {branch.name}
                  {branch.is_main && <Badge variant="secondary">Principal</Badge>}
                  {branch.id === activeBranchId && (
                    <Badge variant="outline">
                      <Check className="size-3" /> Activa
                    </Badge>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {[branch.address, branch.phone].filter(Boolean).join(" · ") || "Sin datos"}
                </p>
              </div>
              <div className="flex gap-2">
                {branch.id !== activeBranchId && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      run(() => switchBranch(branch.id), `Sucursal activa: ${branch.name}`)
                    }
                  >
                    Usar
                  </Button>
                )}
                {canManageBranch && (
                  <Button size="sm" variant="ghost" onClick={() => setEditingBranch(branch)}>
                    Editar
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog
        open={creatingBranch || editingBranch !== null}
        onOpenChange={(next) => {
          if (!next) {
            setCreatingBranch(false);
            setEditingBranch(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingBranch ? "Editar sucursal" : "Nueva sucursal"}</DialogTitle>
            <DialogDescription>
              Cada sucursal tiene su propio salón, catálogo y caja.
            </DialogDescription>
          </DialogHeader>
          <form
            action={(formData) => run(() => saveBranch(editingBranch?.id ?? null, formData), "Sucursal guardada.")}
            className="space-y-4"
          >
            <Field id="branch-name" label="Nombre *" defaultValue={editingBranch?.name ?? ""} />
            <Field
              id="branch-address"
              label="Dirección"
              defaultValue={editingBranch?.address ?? ""}
            />
            <Field id="branch-phone" label="Teléfono" defaultValue={editingBranch?.phone ?? ""} />
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setCreatingBranch(false);
                  setEditingBranch(null);
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
    </div>
  );
}

function Field({
  id,
  label,
  defaultValue,
  type = "text",
}: {
  id: string;
  label: string;
  defaultValue: string;
  type?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} type={type} defaultValue={defaultValue} />
    </div>
  );
}
