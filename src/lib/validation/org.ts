import { z } from "zod";

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal(""));

export const organizationSchema = z.object({
  name: z.string().trim().min(2, "Ingresá un nombre válido").max(120),
  email: optionalText(120),
  phone: optionalText(40),
  address: optionalText(200),
  legal_name: optionalText(120),
  tax_id: optionalText(40),
});

export const branchSchema = z.object({
  name: z.string().trim().min(1, "Ingresá un nombre").max(60),
  address: optionalText(200),
  phone: optionalText(40),
});
