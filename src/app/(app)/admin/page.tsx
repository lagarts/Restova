import { requireOrgContext } from "@/lib/tenant/require";
import { requirePlatformAdmin } from "@/lib/auth/platform-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import AdminView, { type SubscriberRow } from "./admin-view";

type SubscriptionRow = {
  status: string;
  plan: string | null;
  trial_start: string | null;
  trial_end: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

type OrgRow = {
  id: string;
  name: string;
  created_at: string;
  subscriptions: SubscriptionRow | null;
  org_members: { role: string; user_id: string }[];
};

const DAY_MS = 86_400_000;

function isFreeForever(subscription: SubscriptionRow | null): boolean {
  return Boolean(subscription && subscription.status === "active" && !subscription.current_period_end);
}

function remainingDays(subscription: SubscriptionRow | null): number | null {
  if (!subscription) return 0;
  if (isFreeForever(subscription)) return null;

  const now = Date.now();
  const until = (iso: string | null) => (iso ? Math.ceil((Date.parse(iso) - now) / DAY_MS) : 0);

  if (subscription.trial_end && Date.parse(subscription.trial_end) > now) return until(subscription.trial_end);
  if (
    subscription.status === "active" &&
    subscription.current_period_end &&
    Date.parse(subscription.current_period_end) > now
  ) {
    return until(subscription.current_period_end);
  }
  return 0;
}

async function fetchEmails(userIds: string[]): Promise<Map<string, { email: string; name: string | null }>> {
  const found = new Map<string, { email: string; name: string | null }>();
  if (userIds.length === 0) return found;

  try {
    const admin = createAdminClient();
    let page = 1;
    while (page <= 25) {
      const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      for (const user of data?.users ?? []) {
        if (userIds.includes(user.id) && user.email) {
          const metadata = user.user_metadata as { full_name?: string } | undefined;
          found.set(user.id, { email: user.email, name: metadata?.full_name ?? null });
        }
      }
      if (!data || data.users.length < 200) break;
      page += 1;
    }
  } catch {
    // Service key not configured: emails stay hidden.
  }

  return found;
}

export default async function AdminPage() {
  const context = await requireOrgContext();
  await requirePlatformAdmin();

  let rows: SubscriberRow[] = [];
  let loadError: string | null = null;

  try {
    createAdminClient();
  } catch {
    loadError = "Falta la clave de servicio en el servidor.";
  }

  if (!loadError) {
    const admin = createAdminClient();

    const { data, error } = await admin
      .from("organizations")
      .select(
        `id, name, created_at,
         subscriptions(status, plan, trial_start, trial_end, current_period_start, current_period_end, cancel_at_period_end),
         org_members(role, user_id)`
      )
      .order("created_at", { ascending: false });

    if (error) {
      loadError = "No pudimos leer las organizaciones.";
    } else if (data) {
      const orgs = data as unknown as OrgRow[];

      const ownerIds = orgs
        .map((org) => {
          const members = org.org_members ?? [];
          const owner = members.find((member) => member.role === "admin") ?? members[0];
          return owner?.user_id ?? null;
        })
        .filter((id): id is string => Boolean(id));

      const emails = await fetchEmails([...new Set(ownerIds)]);

      rows = orgs.map((org) => {
        const members = org.org_members ?? [];
        const owner = members.find((member) => member.role === "admin") ?? members[0];
        const identity = owner ? emails.get(owner.user_id) : undefined;
        const subscription = org.subscriptions;

        return {
          orgId: org.id,
          orgName: org.name,
          registeredAt: org.created_at,
          ownerEmail: identity?.email ?? null,
          ownerName: identity?.name ?? null,
          status: subscription?.status ?? "none",
          plan: subscription?.plan ?? null,
          trialEnd: subscription?.trial_end ?? null,
          currentPeriodEnd: subscription?.current_period_end ?? null,
          cancelAtPeriodEnd: subscription?.cancel_at_period_end ?? false,
          daysLeft: remainingDays(subscription),
          isFreeForever: isFreeForever(subscription),
          memberCount: members.length,
          isSelf: org.id === context.orgId,
        };
      });
    }
  }

  return <AdminView rows={rows} loadError={loadError} />;
}
