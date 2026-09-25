import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SubscriptionBanner() {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-warning/30 bg-warning/10 px-4 py-3 text-sm md:px-6">
      <AlertTriangle className="size-4 shrink-0 text-warning" />
      <p className="min-w-0 flex-1">
        Tu período gratuito de 3 meses ha finalizado. Para continuar operando, activá tu
        suscripción.
      </p>
      <Button
        render={<Link href="/configuracion/suscripcion" />}
        size="sm"
        variant="outline"
        className="shrink-0 bg-background"
      >
        Activar suscripción
      </Button>
    </div>
  );
}
