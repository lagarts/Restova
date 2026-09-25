"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BRANCH_COOKIE } from "@/lib/tenant/context";
import { cookies } from "next/headers";

export type OnboardingState = { error?: string };

export async function completeOnboarding(
  _prev: OnboardingState,
  formData: FormData
): Promise<OnboardingState> {
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const branchName = String(formData.get("branch_name") ?? "").trim();

  if (name.length < 2) {
    return { error: "Ingresá el nombre del negocio." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data, error } = await supabase.rpc("register_organization", {
    _name: name,
    _phone: phone,
    _address: address,
    _email: user.email ?? null,
    _branch_name: branchName || null,
  });

  if (error) {
    const code = error.message ?? "";
    if (code.includes("already_registered")) {
      redirect("/dashboard");
    }
    if (code.includes("not_authenticated")) {
      redirect("/login");
    }
    return { error: "No pudimos crear el negocio. Revisá los datos e intentá nuevamente." };
  }

  const { data: branch } = await supabase
    .from("branches")
    .select("id")
    .eq("org_id", data as unknown as string)
    .eq("is_main", true)
    .maybeSingle();

  if (branch?.id) {
    const store = await cookies();
    store.set(BRANCH_COOKIE, branch.id, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  redirect("/onboarding/catalogo");
}
