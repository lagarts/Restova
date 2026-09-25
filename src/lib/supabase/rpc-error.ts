const MESSAGES: Record<string, string> = {
  not_authenticated: "Tu sesión expiró. Volvé a entrar.",
  not_member: "No tenés acceso a este negocio.",
  forbidden: "Tu rol no permite esta acción.",
  subscription_expired: "La suscripción no está activa.",
  already_registered: "Este usuario ya tiene un negocio configurado.",
  session_not_found: "La mesa no está abierta.",
  session_closed: "La mesa ya fue cerrada.",
  order_not_found: "No encontramos la comanda.",
  order_already_sent: "La comanda ya fue enviada a cocina.",
  order_not_cancellable: "Esta comanda ya no se puede cancelar.",
  order_not_active: "La comanda no está activa.",
  empty_order: "Agregá al menos un producto.",
  product_not_available: "Ese producto no está disponible.",
  invalid_quantity: "Cantidad inválida.",
  item_not_found: "No encontramos el ítem.",
  nothing_to_charge: "No hay nada para cobrar en esta mesa.",
  cash_register_closed: "Abrí la caja antes de cobrar.",
  register_already_closed: "La caja ya está cerrada.",
  register_not_found: "No encontramos la caja.",
  invalid_amount: "Importe inválido.",
  invalid_payments: "Los pagos no son válidos.",
  invalid_total: "El total no es válido.",
  payments_do_not_match_total: "Los pagos no coinciden con el total.",
  branch_not_found: "No encontramos la sucursal.",
};

export function mapRpcError(error: { code?: string; message?: string } | null): string {
  if (!error) return "No pudimos completar la operación.";

  const raw = error.message ?? "";
  const key = Object.keys(MESSAGES).find(
    (candidate) =>
      raw === candidate ||
      raw.includes(candidate) ||
      raw.toLowerCase().includes(candidate.toLowerCase())
  );
  if (key) return MESSAGES[key];

  if (error.code === "23505") return "Ese registro ya existe.";
  if (error.code === "23503") return "No se puede eliminar: está referenciado.";
  if (error.code === "42501") return "Tu rol no permite esta acción.";

  return "No pudimos completar la operación.";
}
