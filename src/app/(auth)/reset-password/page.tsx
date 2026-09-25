import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth/session";
import ResetPasswordForm from "./reset-password-form";

export default async function ResetPasswordPage() {
  const user = await getUser();
  if (!user) redirect("/forgot-password");

  return <ResetPasswordForm />;
}
