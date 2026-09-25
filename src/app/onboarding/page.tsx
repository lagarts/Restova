import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth/session";
import { getOrgContext } from "@/lib/tenant/context";
import OnboardingWizard from "./wizard";

export default async function OnboardingPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const context = await getOrgContext();
  if (context) redirect("/dashboard");

  return <OnboardingWizard email={user.email ?? ""} />;
}
