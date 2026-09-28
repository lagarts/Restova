import {
  LayoutDashboard,
  UtensilsCrossed,
  ClipboardList,
  ChefHat,
  Package,
  Users,
  Receipt,
  Wallet,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import type { Permission } from "@/lib/auth/rbac";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  permission: Permission;
  /** Route implemented and wired to the backend. */
  enabled: boolean;
  /** Operational surfaces are unusable while the subscription is blocked. */
  requiresOperation?: boolean;
  /** Only visible to the platform superadmin, outside of any organization. */
  platformAdmin?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, permission: "org.view", enabled: true },
  {
    label: "Mesas",
    href: "/mesas",
    icon: UtensilsCrossed,
    permission: "tables.view",
    enabled: true,
    requiresOperation: true,
  },
  {
    label: "Pedidos",
    href: "/pedidos",
    icon: ClipboardList,
    permission: "orders.view",
    enabled: true,
    requiresOperation: true,
  },
  { label: "Cocina", href: "/cocina", icon: ChefHat, permission: "kitchen.view", enabled: true },
  { label: "Productos", href: "/productos", icon: Package, permission: "catalog.view", enabled: true },
  { label: "Clientes", href: "/clientes", icon: Users, permission: "customers.view", enabled: true },
  { label: "Ventas", href: "/ventas", icon: Receipt, permission: "sales.view", enabled: true },
  {
    label: "Caja",
    href: "/caja",
    icon: Wallet,
    permission: "cash.view",
    enabled: true,
    requiresOperation: true,
  },
  { label: "Mozos", href: "/usuarios", icon: Users, permission: "users.view", enabled: true },
  { label: "Configuración", href: "/configuracion", icon: Settings, permission: "org.view", enabled: true },
  { label: "Admin", href: "/admin", icon: ShieldCheck, permission: "org.view", enabled: true, platformAdmin: true },
];
