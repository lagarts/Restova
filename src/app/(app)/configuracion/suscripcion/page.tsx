import Link from "next/link";
import { requireOrgContext } from "@/lib/tenant/require";
import { can } from "@/lib/auth/rbac";
import SuscripcionView from "./suscripcion-view";

export default async function SuscripcionPage() {
  const context = await requireOrgContext();
  const subscription = context.subscription;

  return (
    <>
      <div className="mb-4">
        <Link href="/configuracion" className="text-sm text-muted-foreground underline">
          ← Configuración
        </Link>
      </div>
      <SuscripcionView
        plan={subscription?.plan ?? "trial"}
        status={subscription?.status ?? "trial"}
        trialEnd={subscription?.trial_end ?? null}
        periodStart={subscription?.current_period_start ?? null}
        periodEnd={subscription?.current_period_end ?? null}
        cancelAtPeriodEnd={subscription?.cancel_at_period_end ?? false}
        canOperate={context.canOperate}
        canManage={can(context.role, "subscription.manage")}
      />
    </>
  );
}
