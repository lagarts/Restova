import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/utils/date";

const STATUS_LABEL: Record<string, string> = {
  trial: "Prueba",
  active: "Activa",
  past_due: "Vencida",
  suspended: "Suspendida",
  cancelled: "Cancelada",
};

type Props = {
  plan: string;
  status: string;
  trialEnd: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canOperate: boolean;
  canManage: boolean;
};

export default function SuscripcionView({
  plan,
  status,
  trialEnd,
  periodEnd,
  cancelAtPeriodEnd,
  canOperate,
}: Props) {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Suscripción</h1>
        <p className="text-sm text-muted-foreground">Estado de la cuenta y del período de prueba.</p>
      </header>

      {canOperate ? (
        <Alert>
          <AlertTitle>Operando normalmente</AlertTitle>
          <AlertDescription>
            {status === "trial"
              ? "Estás usando RESTOVA en período de prueba."
              : "Tu suscripción está activa."}
          </AlertDescription>
        </Alert>
      ) : (
        <Alert variant="destructive">
          <AlertTitle>Suscripción no activa</AlertTitle>
          <AlertDescription>
            La operación está pausada: no podés tomar pedidos, cobrar ni abrir caja.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Info label="Plan" value={plan} />
        <Info label="Estado" value={STATUS_LABEL[status] ?? status} />
        <Info label="Fin de prueba" value={trialEnd ? formatDate(trialEnd) : "—"} />
        <Info
          label="Fin de período"
          value={periodEnd ? formatDate(periodEnd) : "—"}
          badge={cancelAtPeriodEnd ? "Se cancela al finalizar" : undefined}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">¿Qué incluye?</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
          <p>· Salón con mapa de mesas y comandas por mesa.</p>
          <p>· Cocina en tiempo real (KDS).</p>
          <p>· Caja con apertura, cobro por mesa y cierre.</p>
          <p>· Ventas y reportes por período.</p>
          <p>· Gestión de usuarios y roles.</p>
          <p>· Soporte por email.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function Info({ label, value, badge }: { label: string; value: string; badge?: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold">{value}</p>
        {badge && (
          <Badge variant="outline" className="mt-1">
            {badge}
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}
