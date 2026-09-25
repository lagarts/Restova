import { requireOrgContext } from "@/lib/tenant/require";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { can } from "@/lib/auth/rbac";
import UsuariosView, { type MemberRow } from "./usuarios-view";

export default async function UsuariosPage() {
  const context = await requireOrgContext();
  const supabase = await createClient();

  const { data: memberRows } = await supabase
    .from("org_members")
    .select("id, user_id, role, branch_id, active, created_at")
    .eq("org_id", context.orgId)
    .order("created_at");

  const members = (memberRows ?? []) as {
    id: string;
    user_id: string;
    role: string;
    branch_id: string | null;
    active: boolean;
    created_at: string;
  }[];

  const userIds = members.map((member) => member.user_id);

  const profiles = new Map<string, { name: string | null; phone: string | null }>();
  const emails = new Map<string, string>();

  if (userIds.length > 0) {
    const { data: profileRows } = await supabase
      .from("profiles")
      .select("id, full_name, phone")
      .in("id", userIds);

    for (const profile of (profileRows ?? []) as {
      id: string;
      full_name: string | null;
      phone: string | null;
    }[]) {
      profiles.set(profile.id, { name: profile.full_name, phone: profile.phone });
    }

    try {
      const admin = createAdminClient();
      let page = 1;
      while (page <= 25) {
        const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
        for (const user of data?.users ?? []) {
          if (userIds.includes(user.id) && user.email) emails.set(user.id, user.email);
        }
        if (!data || data.users.length < 200) break;
        page += 1;
      }
    } catch {
      // Service key not configured: emails stay hidden.
    }
  }

  const rows: MemberRow[] = members.map((member) => ({
    id: member.id,
    userId: member.user_id,
    role: member.role,
    active: member.active,
    createdAt: member.created_at,
    name: profiles.get(member.user_id)?.name ?? "Sin nombre",
    phone: profiles.get(member.user_id)?.phone ?? null,
    email: emails.get(member.user_id) ?? null,
    isYou: member.user_id === context.userId,
  }));

  return (
    <UsuariosView
      members={rows}
      canManage={can(context.role, "users.manage")}
      canOperate={context.canOperate}
    />
  );
}
