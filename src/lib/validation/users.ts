import { z } from "zod";
import { ROLES } from "@/lib/auth/rbac";

export const inviteSchema = z.object({
  email: z.email("Ingresá un email válido").max(160),
  full_name: z.string().trim().min(2, "Ingresá un nombre").max(120),
  role: z.enum(ROLES),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
});

export const roleSchema = z.object({
  member_id: z.string().uuid(),
  role: z.enum(ROLES),
});
