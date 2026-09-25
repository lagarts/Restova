"use client";

import { useActionState, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Loader2, UtensilsCrossed } from "lucide-react";
import { completeOnboarding, type OnboardingState } from "@/app/onboarding/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const STEPS = ["Bienvenido", "Datos del negocio", "Primera sucursal", "Listo"];

const initialState: OnboardingState = {};

export default function OnboardingWizard({ email }: { email: string }) {
  const [step, setStep] = useState(0);
  const [state, formAction, pending] = useActionState(completeOnboarding, initialState);

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="border-b bg-sidebar text-sidebar-foreground">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center gap-2.5 px-5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <UtensilsCrossed className="size-4" />
          </span>
          <span className="font-semibold tracking-tight">Restova</span>
          <span className="ml-auto text-xs text-sidebar-foreground/60">{email}</span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-5 py-10">
        <ol className="mb-8 flex items-center gap-2">
          {STEPS.map((label, index) => {
            const state_ = index < step ? "done" : index === step ? "current" : "todo";
            return (
              <li key={label} className="flex flex-1 flex-col gap-2">
                <div
                  className={[
                    "h-1.5 rounded-full transition-colors",
                    state_ === "done" ? "bg-primary" : state_ === "current" ? "bg-primary/50" : "bg-muted",
                  ].join(" ")}
                />
                <span
                  className={[
                    "text-xs",
                    state_ === "current" ? "font-medium text-foreground" : "text-muted-foreground",
                  ].join(" ")}
                >
                  {label}
                </span>
              </li>
            );
          })}
        </ol>

        {step === 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl tracking-tight">Bienvenido a Restova</CardTitle>
              <CardDescription>
                Vas a configurar tu negocio en menos de 2 minutos. Después seguís con productos,
                mesas, mozos y caja.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => setStep(1)}>
                Comenzar <ArrowRight className="size-4" />
              </Button>
            </CardContent>
          </Card>
        )}

        {(step === 1 || step === 2) && (
          <form action={formAction}>
            <Card>
              <CardHeader>
                <CardTitle className="text-xl tracking-tight">
                  {step === 1 ? "Datos del negocio" : "Tu primera sucursal"}
                </CardTitle>
                <CardDescription>
                  {step === 1
                    ? "Esto aparece en tickets y reportes. Podés editarlo después."
                    : "Siempre podés agregar más sucursales más adelante."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {state.error && (
                  <Alert variant="destructive">
                    <AlertDescription>{state.error}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-4" hidden={step !== 1}>
                  <div className="space-y-2">
                    <Label htmlFor="name">Nombre del negocio *</Label>
                    <Input id="name" name="name" placeholder="Bodega La Esquina" required />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="phone">Teléfono</Label>
                      <Input id="phone" name="phone" type="tel" placeholder="+54 9 11 5555 5555" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="address">Dirección</Label>
                      <Input id="address" name="address" placeholder="Av. Corrientes 1234" />
                    </div>
                  </div>
                </div>

                <div className="space-y-2" hidden={step !== 2}>
                  <Label htmlFor="branch_name">Nombre de la sucursal</Label>
                  <Input
                    id="branch_name"
                    name="branch_name"
                    placeholder="Sucursal principal"
                    defaultValue="Sucursal principal"
                  />
                  <p className="text-xs text-muted-foreground">
                    Dejalo vacío para usar «Sucursal principal».
                  </p>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setStep((s) => Math.max(0, s - 1))}
                    disabled={pending}
                  >
                    <ArrowLeft className="size-4" /> Atrás
                  </Button>

                  {step === 1 ? (
                    <Button type="button" onClick={() => setStep(2)}>
                      Continuar <ArrowRight className="size-4" />
                    </Button>
                  ) : (
                    <Button type="submit" disabled={pending}>
                      {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                      Crear negocio
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </form>
        )}
      </main>
    </div>
  );
}
