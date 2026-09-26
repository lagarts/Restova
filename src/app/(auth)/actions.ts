"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { AuthError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export type AuthActionState = {
  error?: string;
  success?: string;
};

function signInErrorMessage(error: AuthError): string {
  const code = error.code ?? "";
  const message = error.message ?? "";

  if (code === "invalid_credentials" || /invalid login credentials/i.test(message)) {
    return "Email o contraseña incorrectos.";
  }
  if (code === "email_not_confirmed" || /email not confirmed/i.test(message)) {
    return "Tu email todavía no está confirmado. Revisá tu bandeja o pedí un restablecimiento de contraseña.";
  }
  if (
    code === "over_request_rate_limit" ||
    code === "too_many_requests" ||
    /rate limit/i.test(message)
  ) {
    return "Demasiados intentos. Esperá un minuto y probá de nuevo.";
  }
  if (code === "user_banned" || /banned/i.test(message)) {
    return "Esta cuenta está deshabilitada. Contactá al administrador.";
  }
  return "No pudimos iniciar sesión. Intentá nuevamente.";
}

function signUpErrorMessage(error: AuthError): string {
  const code = error.code ?? "";
  const message = error.message ?? "";

  if (code === "user_already_exists" || /already registered/i.test(message)) {
    return "Ya existe una cuenta con ese email.";
  }
  if (code === "over_request_rate_limit" || code === "too_many_requests" || /rate limit/i.test(message)) {
    return "Demasiados intentos de registro. Esperá unos minutos y probá de nuevo.";
  }
  if (code === "weak_password" || /password should be/i.test(message)) {
    return "La contraseña es demasiado débil. Usá al menos 8 caracteres.";
  }
  return "No pudimos crear la cuenta. Intentá nuevamente.";
}

function safeNext(raw: string | null | undefined): string {
  if (!raw) return "/dashboard";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  return raw;
}

export async function signIn(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(String(formData.get("next") ?? ""));

  if (!email || !password) {
    return { error: "Ingresá tu email y tu contraseña." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: signInErrorMessage(error) };
  }

  revalidatePath("/", "layout");
  redirect(next);
}

export async function signUp(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const business = String(formData.get("business_name") ?? "").trim();

  if (!fullName || !email || !password || !business) {
    return { error: "Completá todos los campos obligatorios." };
  }
  if (password.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, phone, business_name: business },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/callback`,
    },
  });

  if (error) {
    return { error: signUpErrorMessage(error) };
  }

  if (!data.session) {
    return { success: "Revisá tu email para confirmar tu cuenta y continuar." };
  }

  revalidatePath("/", "layout");
  redirect("/onboarding");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

export async function requestPasswordReset(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "Ingresá tu email." };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/callback?next=/reset-password`,
  });

  if (error) {
    return { error: "No pudimos enviar el email. Intentá nuevamente." };
  }

  return { success: "Si el email existe, te enviamos un enlace de recuperación." };
}

export async function updatePassword(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 8) return { error: "La contraseña debe tener al menos 8 caracteres." };
  if (password !== confirm) return { error: "Las contraseñas no coinciden." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) return { error: "No pudimos actualizar la contraseña." };

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
