import { redirect } from "next/navigation";
import { getOrgContext, type OrgContext } from "@/lib/tenant/context";
import { getUser } from "@/lib/auth/session";

/** User authenticated but without an organization → onboarding. */
export async function requireOrgContext(): Promise<OrgContext> {
  const user = await getUser();
  if (!user) redirect("/login");

  const context = await getOrgContext();
  if (!context) redirect("/onboarding");

  return context;
}
