import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/auth/rbac";
import type { Branch, Organization, Subscription } from "@/types/domain";

export const BRANCH_COOKIE = "restova_branch";

type MemberRow = {
  role: Role;
  branch_id: string | null;
  org: (Organization & {
    branches: Branch[];
    subscriptions: Subscription | null;
  }) | null;
};

export type OrgContext = {
  userId: string;
  orgId: string;
  role: Role;
  org: Organization;
  branches: Branch[];
  branchId: string;
  branch: Branch;
  subscription: Subscription | null;
  canOperate: boolean;
};

/** Mirrors public.can_operate(); the database remains authoritative. */
export function isSubscriptionOperable(subscription: Subscription | null): boolean {
  if (!subscription) return false;
  const now = Date.now();
  const trialEnd = Date.parse(subscription.trial_end);
  if ((subscription.status === "suspended" || subscription.status === "cancelled") && trialEnd <= now) {
    return false;
  }
  if (trialEnd > now) return true;
  if (subscription.status === "active") {
    const periodEnd = subscription.current_period_end
      ? Date.parse(subscription.current_period_end)
      : Number.POSITIVE_INFINITY;
    return periodEnd > now;
  }
  return false;
}

export const getOrgContext = cache(async (): Promise<OrgContext | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase.from("org_members").select(`
      role,
      branch_id,
      org:organizations(
        id, name, legal_name, tax_id, email, phone, address, logo_url,
        settings, created_at, updated_at, deleted_at,
        branches(*),
        subscriptions(*)
      )
    `);

  if (error || !data || data.length === 0) return null;

  const row = data[0] as unknown as MemberRow;
  if (!row.org) return null;

  const branches = (row.org.branches ?? [])
    .filter((b) => !b.deleted_at && b.active)
    .sort((a, b) => Number(b.is_main) - Number(a.is_main) || a.name.localeCompare(b.name));

  if (branches.length === 0) return null;

  const store = await cookies();
  const cookieBranch = store.get(BRANCH_COOKIE)?.value;
  const preferred =
    (cookieBranch && branches.find((b) => b.id === cookieBranch)?.id) ||
    row.branch_id ||
    branches.find((b) => b.is_main)?.id ||
    branches[0].id;

  const branch = branches.find((b) => b.id === preferred) ?? branches[0];
  const subscription = row.org.subscriptions;

  return {
    userId: user.id,
    orgId: row.org.id,
    role: row.role,
    org: row.org,
    branches,
    branchId: branch.id,
    branch,
    subscription,
    canOperate: isSubscriptionOperable(subscription),
  };
});
