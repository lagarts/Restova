"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, UtensilsCrossed } from "lucide-react";
import { NAV_ITEMS } from "@/components/layout/nav-items";
import { can, type Role } from "@/lib/auth/rbac";
import { signOut } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { cn } from "cn";

type Props = {
  role: Role;
  businessName: string;
  branchName: string;
  canOperate: boolean;
};

export function Sidebar({ role, businessName, branchName, canOperate }: Props) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => item.enabled && can(role, item.permission));

  return (
    <aside className="flex h-full w-16 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground md:w-60">
      <div className="flex h-14 items-center gap-2.5 border-b border-sidebar-border px-4">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <UtensilsCrossed className="size-4" />
        </span>
        <div className="hidden min-w-0 md:block">
          <p className="truncate text-sm font-semibold leading-tight">Restova</p>
          <p className="truncate text-xs leading-tight text-sidebar-foreground/60">{businessName}</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2 scroll-thin">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const disabled = item.requiresOperation && !canOperate;
          return (
            <Link
              key={item.href}
              href={disabled ? "#" : item.href}
              aria-disabled={disabled}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                active && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                disabled && "cursor-not-allowed opacity-40 hover:bg-transparent"
              )}
            >
              <item.icon className="size-4 shrink-0" />
              <span className="hidden truncate md:block">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <div className="mb-2 hidden md:block">
          <p className="text-xs text-sidebar-foreground/60">Sucursal</p>
          <p className="truncate text-sm">{branchName}</p>
        </div>
        <form action={signOut}>
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <LogOut className="size-4" />
            <span className="hidden md:block">Cerrar sesión</span>
          </Button>
        </form>
      </div>
    </aside>
  );
}
