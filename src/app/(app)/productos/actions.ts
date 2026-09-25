"use server";

import { revalidatePath } from "next/cache";
import { requireOrgContext } from "@/lib/tenant/require";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/auth/rbac";
import {
  categorySchema,
  productSchema,
  firstIssue,
} from "@/lib/validation/catalog";

export type ActionResult = { ok: true } | { ok: false; error: string };

async function requireCatalogManager() {
  const context = await requireOrgContext();
  if (!can(context.role, "catalog.manage")) {
    throw new Error("forbidden");
  }
  return context;
}

function revalidateCatalog() {
  revalidatePath("/productos");
  revalidatePath("/dashboard");
}

export async function saveCategory(
  categoryId: string | null,
  formData: FormData
): Promise<ActionResult> {
  const context = await requireCatalogManager();

  const parsed = categorySchema.safeParse({
    name: formData.get("name"),
    icon: formData.get("icon") ?? "",
    active: formData.get("active") === "on" || formData.get("active") === "true",
  });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const supabase = await createClient();

  if (categoryId) {
    const { error } = await supabase
      .from("categories")
      .update({ name: parsed.data.name, icon: parsed.data.icon || null, active: parsed.data.active })
      .eq("id", categoryId)
      .eq("branch_id", context.branchId);
    if (error) return { ok: false, error: "No pudimos guardar la categoría." };
  } else {
    const { data: max } = await supabase
      .from("categories")
      .select("sort_order")
      .eq("branch_id", context.branchId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { error } = await supabase.from("categories").insert({
      org_id: context.orgId,
      branch_id: context.branchId,
      name: parsed.data.name,
      icon: parsed.data.icon || null,
      active: parsed.data.active,
      sort_order: (max?.sort_order ?? -1) + 1,
    });
    if (error) return { ok: false, error: "No pudimos crear la categoría." };
  }

  revalidateCatalog();
  return { ok: true };
}

export async function deleteCategory(categoryId: string): Promise<ActionResult> {
  const context = await requireCatalogManager();
  const supabase = await createClient();

  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("id", categoryId)
    .eq("branch_id", context.branchId);

  if (error) {
    return { ok: false, error: "No pudimos eliminar la categoría." };
  }

  revalidateCatalog();
  return { ok: true };
}

export async function saveProduct(
  productId: string | null,
  formData: FormData
): Promise<ActionResult> {
  const context = await requireCatalogManager();

  const parsed = productSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    category_id: formData.get("category_id") ?? "",
    price: formData.get("price") ?? "0",
    delivery_price: formData.get("delivery_price") || null,
    sku: formData.get("sku") ?? "",
    prep_time_minutes: formData.get("prep_time_minutes") || null,
    available: formData.get("available") === "on" || formData.get("available") === "true",
    track_stock: formData.get("track_stock") === "on" || formData.get("track_stock") === "true",
    stock: formData.get("stock") || null,
  });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const categoryId = parsed.data.category_id || null;

  if (categoryId) {
    const { data: category } = await supabase
      .from("categories")
      .select("id")
      .eq("id", categoryId)
      .eq("branch_id", context.branchId)
      .maybeSingle();
    if (!category) return { ok: false, error: "La categoría seleccionada no existe." };
  }

  const payload = {
    name: parsed.data.name,
    description: parsed.data.description || null,
    category_id: categoryId,
    price: parsed.data.price,
    delivery_price: parsed.data.delivery_price === null ? null : parsed.data.delivery_price,
    sku: parsed.data.sku || null,
    prep_time_minutes: parsed.data.prep_time_minutes === null ? null : parsed.data.prep_time_minutes,
    available: parsed.data.available,
    track_stock: parsed.data.track_stock,
    stock: parsed.data.track_stock ? (parsed.data.stock ?? 0) : null,
  };

  if (productId) {
    const { error } = await supabase
      .from("products")
      .update(payload)
      .eq("id", productId)
      .eq("branch_id", context.branchId);
    if (error) {
      if (error.code === "23505") return { ok: false, error: "Ya existe un producto con ese SKU." };
      return { ok: false, error: "No pudimos guardar el producto." };
    }
  } else {
    const { data: max } = await supabase
      .from("products")
      .select("sort_order")
      .eq("branch_id", context.branchId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { error } = await supabase.from("products").insert({
      org_id: context.orgId,
      branch_id: context.branchId,
      sort_order: (max?.sort_order ?? -1) + 1,
      ...payload,
    });
    if (error) {
      if (error.code === "23505") return { ok: false, error: "Ya existe un producto con ese SKU." };
      return { ok: false, error: "No pudimos crear el producto." };
    }
  }

  revalidateCatalog();
  return { ok: true };
}

export async function deleteProduct(productId: string): Promise<ActionResult> {
  const context = await requireCatalogManager();
  const supabase = await createClient();

  const { error } = await supabase
    .from("products")
    .delete()
    .eq("id", productId)
    .eq("branch_id", context.branchId);

  if (error) return { ok: false, error: "No pudimos eliminar el producto." };

  revalidateCatalog();
  return { ok: true };
}

export async function toggleProductAvailability(
  productId: string,
  available: boolean
): Promise<ActionResult> {
  const context = await requireCatalogManager();
  const supabase = await createClient();

  const { error } = await supabase
    .from("products")
    .update({ available })
    .eq("id", productId)
    .eq("branch_id", context.branchId);

  if (error) return { ok: false, error: "No pudimos actualizar la disponibilidad." };

  revalidateCatalog();
  return { ok: true };
}
