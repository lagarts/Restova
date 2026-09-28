import { requireOrgContext } from "@/lib/tenant/require";
import { isPlatformAdmin } from "@/lib/auth/platform-admin";
import { Sidebar } from "@/components/layout/sidebar";
import { SubscriptionBanner } from "@/components/layout/subscription-banner";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const context = await requireOrgContext();
  const platformAdmin = await isPlatformAdmin();

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar
        role={context.role}
        businessName={context.org.name}
        branchName={context.branch.name}
        canOperate={context.canOperate}
        isPlatformAdmin={platformAdmin}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {!context.canOperate && <SubscriptionBanner />}
        <main className="flex-1 overflow-y-auto scroll-thin">
          <div className="mx-auto w-full max-w-7xl px-4 py-5 md:px-6 md:py-7">{children}</div>
        </main>
      </div>
    </div>
  );
}
