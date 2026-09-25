import { requireOrgContext } from "@/lib/tenant/require";
import { can } from "@/lib/auth/rbac";
import ConfiguracionView from "./configuracion-view";

export default async function ConfiguracionPage() {
  const context = await requireOrgContext();

  return (
    <ConfiguracionView
      org={context.org}
      branches={context.branches}
      activeBranchId={context.branchId}
      canManageOrg={can(context.role, "org.manage")}
      canManageBranch={can(context.role, "branch.manage")}
      role={context.role}
    />
  );
}
