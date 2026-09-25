import { z } from "zod";

export const orderItemSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.coerce.number().int().min(1, "Cantidad mínima 1").max(99, "Cantidad máxima 99"),
  notes: z.string().trim().max(200).optional().or(z.literal("")),
  modifier_option_ids: z.array(z.string().uuid()).max(30).default([]),
});

export const orderPayloadSchema = z.object({
  items: z.array(orderItemSchema).min(1, "Agregá al menos un producto").max(50),
  notes: z.string().trim().max(300).optional().or(z.literal("")),
});

export type OrderItemInput = z.infer<typeof orderItemSchema>;
export type OrderPayload = z.infer<typeof orderPayloadSchema>;
