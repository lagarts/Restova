import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** True when the signed-in user may administer every tenant. */
export const isPlatformAdmin = cache(async (): Promise<boolean> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase
    .from("profiles")
    .select("is_platform_admin")
    .eq("id", user.id)
    .maybeSingle();

  return Boolean(data?.is_platform_admin);
});

/** Page guard. */
export async function requirePlatformAdmin(): Promise<void> {
  if (!(await isPlatformAdmin())) redirect("/dashboard");
}
