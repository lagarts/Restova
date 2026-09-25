export const ROLES = [
  "admin",
  "encargado",
  "mozo",
  "caja",
  "cocina",
] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrador",
  encargado: "Encargado",
  mozo: "Mozo",
  caja: "Caja",
  cocina: "Cocina",
};

export const PERMISSIONS = {
  // Negocio
  "org.view": ROLES,
  "org.manage": ["admin"],
  "branch.manage": ["admin"],
  "settings.manage": ["admin"],

  // Usuarios
  "users.view": ["admin", "encargado"],
  "users.manage": ["admin"],

  // Catálogo
  "catalog.view": ROLES,
  "catalog.manage": ["admin", "encargado"],

  // Salón / mesas
  "tables.view": ["admin", "encargado", "mozo", "caja"],
  "tables.manage": ["admin", "encargado"],

  // Pedidos
  "orders.view": ROLES,
  "orders.create": ["admin", "encargado", "mozo"],
  "orders.update": ["admin", "encargado", "mozo"],
  "orders.cancel": ["admin", "encargado"],
  "orders.charge": ["admin", "encargado", "caja"],

  // Cocina
  "kitchen.view": ["admin", "encargado", "cocina", "mozo"],
  "kitchen.update": ["admin", "encargado", "cocina"],

  // Caja
  "cash.open": ["admin", "encargado", "caja"],
  "cash.close": ["admin", "encargado", "caja"],
  "cash.view": ["admin", "encargado", "caja"],
  "cash.movements": ["admin", "encargado", "caja"],

  // Ventas y reportes
  "sales.view": ["admin", "encargado", "caja"],
  "reports.view": ["admin", "encargado"],

  // Clientes
  "customers.view": ["admin", "encargado", "mozo", "caja"],
  "customers.manage": ["admin", "encargado", "caja"],

  // Suscripción y pagos
  "subscription.view": ["admin"],
  "subscription.manage": ["admin"],

  // Delivery (fase 2)
  "delivery.view": ["admin", "encargado", "caja"],
  "delivery.manage": ["admin", "encargado"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

export function canAny(role: Role | null | undefined, permissions: readonly Permission[]): boolean {
  return permissions.some((p) => can(role, p));
}

export function canAll(role: Role | null | undefined, permissions: readonly Permission[]): boolean {
  return permissions.every((p) => can(role, p));
}
