import { z } from "zod";

export const PAYMENT_METHODS = [
  "cash",
  "card",
  "transfer",
  "mercadopago",
  "paypal",
  "other",
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  transfer: "Transferencia",
  mercadopago: "Mercado Pago",
  paypal: "PayPal",
  other: "Otro",
};

export const numberField = z.coerce
  .number({ message: "Ingresá un importe válido" })
  .min(0, "No puede ser negativo");

export const paymentSchema = z.object({
  method: z.enum(PAYMENT_METHODS),
  amount: z.coerce.number({ message: "Ingresá un importe válido" }).positive("Debe ser mayor a 0"),
});

export const chargePayloadSchema = z.object({
  payments: z.array(paymentSchema).min(1, "Agregá al menos un pago"),
  discount_amount: z.coerce.number().min(0, "No puede ser negativo").default(0),
});

export type ChargePayload = z.infer<typeof chargePayloadSchema>;
