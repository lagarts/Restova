import { z } from "zod";

export const categorySchema = z.object({
  name: z.string().trim().min(1, "Ingresá un nombre").max(80),
  icon: z.string().trim().max(8).optional().or(z.literal("")),
  active: z.boolean().default(true),
});

export const productSchema = z.object({
  name: z.string().trim().min(1, "Ingresá un nombre").max(120),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  category_id: z.string().uuid().optional().or(z.literal("")),
  price: z.coerce.number().min(0, "El precio no puede ser negativo"),
  delivery_price: z.coerce.number().min(0).optional().nullable(),
  sku: z.string().trim().max(40).optional().or(z.literal("")),
  prep_time_minutes: z.coerce.number().int().min(0).max(600).optional().nullable(),
  available: z.boolean().default(true),
  track_stock: z.boolean().default(false),
  stock: z.coerce.number().min(0).optional().nullable(),
});

export type CategoryInput = z.infer<typeof categorySchema>;
export type ProductInput = z.infer<typeof productSchema>;

export { firstIssue } from "@/lib/validation/common";
