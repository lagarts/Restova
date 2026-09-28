"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import {
  inviteMember,
  removeMember,
  setMemberActive,
  updateMemberRole,
} from "@/app/(app)/usuarios/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { ROLES, ROLE_LABELS, type Role } from "@/lib/auth/rbac";

export type MemberRow = {
  id: string;
  userId: string;
  role: string;
  active: boolean;
  createdAt: string;
  name: string;
  phone: string | null;
  email: string | null;
  isYou: boolean;
};

type Props = {
  members: MemberRow[];
  canManage: boolean;
  canOperate: boolean;
};

export default function UsuariosView({ members, canManage, canOperate }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [inviting, setInviting] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [removing, setRemoving] = useState<MemberRow | null>(null);

  function run(
    task: () => Promise<{ ok: boolean; error?: string; data?: { password?: string } }>,
    success?: string
  ) {
    startTransition(async () => {
      const result = await task();
      if (!result.ok) {
        setError(result.error ?? "No pudimos completar la operaciÃ³n.");
        return;
      }
      setError(null);
      if (result.data?.password) setSecret(result.data.password);
      else if (success) toast.success(success);
      setInviting(false);
      setRemoving(null);
      router.refresh();
    });
  }

  const mozos = members.filter((member) => member.role === "mozo");
  const team = members.filter((member) => member.role !== "mozo");
  const activeCount = members.filter((member) => member.active).length;
  const sections = [
    { title: "Mozos", items: mozos, empty: "TodavÃ­a no hay mozos. CreÃ¡ el primero." },
    { title: "Equipo", items: team, empty: "No hay otros usuarios en el negocio." },
  ];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mozos</h1>
          <p className="text-sm text-muted-foreground">
            {mozos.length} mozo{mozos.length === 1 ? "" : "s"} Â· {team.length} en el equipo Â· {activeCount} activo
            {activeCount === 1 ? "" : "s"}
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setInviting(true)}>
            <UserPlus className="size-4" /> Nuevo mozo
          </Button>
        )}
      </header>

      {!canOperate && (
        <Alert>
          <AlertTitle>SuscripciÃ³n vencida</AlertTitle>
          <AlertDescription>La operaciÃ³n estÃ¡ pausada hasta reactivarla.</AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="p-0">
          <ul className="divide-y">
            {sections.map((section) => (
              <Fragment key={section.title}>
                <li className="bg-muted/50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {section.title} ({section.items.length})
                </li>
                {section.items.length === 0 && (
                  <li className="px-4 py-6 text-center text-sm text-muted-foreground">{section.empty}</li>
                )}
                {section.items.map((member) => (
                  <li key={member.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-medium">
                        {member.name}
                        {member.isYou && <Badge variant="outline">Vos</Badge>}
                        {!member.active && <Badge variant="secondary">Inactivo</Badge>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {member.email ?? "Email no disponible"}
                        {member.phone ? ` Â· ${member.phone}` : ""}
                      </p>
                    </div>
    
                    <div className="flex flex-wrap items-center gap-2">
                      {canManage ? (
                        <select
                          value={member.role}
                          onChange={(event) => {
                            const nextRole = event.target.value;
                            run(() => updateMemberRole(member.id, nextRole), "Rol actualizado.");
                          }}
                          disabled={pending}
                          className="flex h-9 rounded-lg border border-input bg-background px-2 text-sm"
                        >
                          {ROLES.map((role) => (
                            <option key={role} value={role}>
                              {ROLE_LABELS[role]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Badge variant="secondary">{ROLE_LABELS[member.role as Role] ?? member.role}</Badge>
                      )}
    
                      {canManage && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            onClick={() =>
                              run(
                                () => setMemberActive(member.id, !member.active),
                                member.active ? "Usuario desactivado." : "Usuario activado."
                              )
                            }
                          >
                            {member.active ? "Desactivar" : "Activar"}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Eliminar"
                            disabled={member.isYou}
                            onClick={() => setRemoving(member)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </Fragment>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Dialog open={inviting} onOpenChange={setInviting}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo mozo</DialogTitle>
            <DialogDescription>
              Se crea la cuenta con email y contraseÃ±a temporal. AsÃ­ cada venta queda asociada a su usuario.
            </DialogDescription>
          </DialogHeader>
          <form
            action={(formData) => run(() => inviteMember(formData), "Mozo creado.")}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="member-name">Nombre *</Label>
              <Input id="member-name" name="full_name" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="member-email">Email *</Label>
              <Input id="member-email" name="email" type="email" required />
            </div>
            <input type="hidden" name="role" value="mozo" />
            <div className="space-y-2">
              <Label htmlFor="member-phone">TelÃ©fono</Label>
              <Input id="member-phone" name="phone" />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setInviting(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="size-4 animate-spin" />} Crear mozo
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={secret !== null} onOpenChange={(next) => !next && setSecret(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ContraseÃ±a temporal</DialogTitle>
            <DialogDescription>
              Compartila con el usuario. Solo se muestra una vez.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-lg border bg-muted px-3 py-2 font-mono text-sm break-all">
              {secret}
            </code>
            <Button
              size="icon"
              variant="outline"
              onClick={() => {
                if (secret) {
                  void navigator.clipboard.writeText(secret);
                  toast.success("ContraseÃ±a copiada");
                }
              }}
            >
              <Copy className="size-4" />
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setSecret(null)}>Entendido</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={removing !== null} onOpenChange={(next) => !next && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar usuario</DialogTitle>
            <DialogDescription>
              {removing?.name} dejarÃ¡ de tener acceso a este negocio.
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
                if (target) run(() => removeMember(target.id), "Usuario eliminado.");
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
