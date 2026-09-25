import { z } from "zod";

export const GRID_COLUMNS = 12;
export const CELL_HEIGHT = 76;

export const tableSchema = z.object({
  name: z.string().trim().min(1, "Ingresá un nombre").max(40),
  capacity: z.coerce.number().int().min(1, "Capacidad mínima 1").max(60),
  sector: z.string().trim().min(1, "Ingresá un sector").max(60),
  pos_x: z.coerce.number().int().min(0).max(GRID_COLUMNS - 1),
  pos_y: z.coerce.number().int().min(0).max(60),
  width: z.coerce.number().int().min(1).max(6),
  height: z.coerce.number().int().min(1).max(4),
});

export type TableInput = z.infer<typeof tableSchema>;
