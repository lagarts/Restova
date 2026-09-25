import type { ZodError } from "zod";

export function firstIssue(error: ZodError): string {
  return error.issues[0]?.message ?? "Revisá los datos ingresados.";
}
