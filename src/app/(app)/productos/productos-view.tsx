"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2, Package, Pencil, Plus, Tag, Trash2 } from "lucide-react";
import {
  deleteProduct,
  saveCategory,
  saveProduct,
  toggleProductAvailability,
  type ActionResult,
} from "@/app/(app)/productos/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/lib/utils/date";
import type { Category, Product } from "@/types/domain";

type Props = {
  categories: Category[];
  products: Product[];
  canManage: boolean;
};

type CategoryDraft = { name: string; icon: string; active: boolean };
type ProductDraft = {
  name: string;
  description: string;
  category_id: string;
  price: string;
  delivery_price: string;
  sku: string;
  prep_time_minutes: string;
  available: boolean;
};

const emptyCategory: CategoryDraft = { name: "", icon: "", active: true };
const emptyProduct: ProductDraft = {
  name: "",
  description: "",
  category_id: "",
  price: "",
  delivery_price: "",
  sku: "",
  prep_time_minutes: "",
  available: true,
};

export default function ProductosView({ categories, products, canManage }: Props) {
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [productOpen, setProductOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [categoryDraft, setCategoryDraft] = useState<CategoryDraft>(emptyCategory);
  const [productDraft, setProductDraft] = useState<ProductDraft>(emptyProduct);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const grouped = useMemo(() => {
    const byCategory = new Map<string, Product[]>();
    for (const product of products) {
      const key = product.category_id ?? "sin-categoria";
      const list = byCategory.get(key) ?? [];
      list.push(product);
      byCategory.set(key, list);
    }
    return categories.map((category) => ({
      category,
      items: byCategory.get(category.id) ?? [],
    }));
  }, [categories, products]);

  const loose = useMemo(() => products.filter((p) => !p.category_id), [products]);

  function openCategory(category?: Category) {
    setEditingCategory(category ?? null);
    setCategoryDraft(
      category
        ? { name: category.name, icon: category.icon ?? "", active: category.active }
        : emptyCategory
    );
    setError(null);
    setCategoryOpen(true);
  }

  function openProduct(product?: Product, categoryId?: string) {
    setEditingProduct(product ?? null);
    setProductDraft(
      product
        ? {
            name: product.name,
            description: product.description ?? "",
            category_id: product.category_id ?? "",
            price: String(product.price),
            delivery_price: product.delivery_price == null ? "" : String(product.delivery_price),
            sku: product.sku ?? "",
            prep_time_minutes: product.prep_time_minutes == null ? "" : String(product.prep_time_minutes),
            available: product.available,
          }
        : { ...emptyProduct, category_id: categoryId ?? categories[0]?.id ?? "" }
    );
    setError(null);
    setProductOpen(true);
  }

  function submitCategory(formData: FormData) {
    startTransition(async () => {
      const result: ActionResult = await saveCategory(editingCategory?.id ?? null, formData);
      if (result.ok) {
        setCategoryOpen(false);
        setError(null);
      } else {
        setError(result.error);
      }
    });
  }

  function submitProduct(formData: FormData) {
    startTransition(async () => {
      const result: ActionResult = await saveProduct(editingProduct?.id ?? null, formData);
      if (result.ok) {
        setProductOpen(false);
        setError(null);
      } else {
        setError(result.error);
      }
    });
  }

  function run(action: () => Promise<ActionResult>) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Productos</h1>
          <p className="text-sm text-muted-foreground">
            {products.length} producto{products.length === 1 ? "" : "s"} · {categories.length}{" "}
            categoría{categories.length === 1 ? "" : "s"}
          </p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => openCategory()}>
              <Tag className="size-4" /> Categoría
            </Button>
            <Button onClick={() => openProduct()}>
              <Plus className="size-4" /> Producto
            </Button>
          </div>
        )}
      </header>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {categories.length === 0 && products.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <Package className="size-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              Todavía no cargaste productos. Creá una categoría y empezá a sumar.
            </p>
            {canManage && (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => openCategory()}>
                  <Tag className="size-4" /> Nueva categoría
                </Button>
                <Button onClick={() => openProduct()}>
                  <Plus className="size-4" /> Nuevo producto
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {grouped.map(({ category, items }) => (
            <Card key={category.id}>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="flex items-center gap-2 text-base font-medium">
                  <span aria-hidden>{category.icon || "•"}</span>
                  {category.name}
                  {!category.active && <Badge variant="outline">Inactiva</Badge>}
                  <Badge variant="secondary">{items.length}</Badge>
                </CardTitle>
                {canManage && (
                  <Button variant="ghost" size="icon-sm" onClick={() => openCategory(category)}>
                    <Pencil className="size-4" />
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {items.length === 0 ? (
                  <p className="py-3 text-sm text-muted-foreground">Sin productos en esta categoría.</p>
                ) : (
                  <ul className="divide-y">
                    {items.map((product) => (
                      <ProductRow
                        key={product.id}
                        product={product}
                        canManage={canManage}
                        onEdit={() => openProduct(product)}
                        onToggle={() =>
                          run(() => toggleProductAvailability(product.id, !product.available))
                        }
                        onDelete={() => run(() => deleteProduct(product.id))}
                      />
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))}

          {loose.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-medium">Sin categoría</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y">
                  {loose.map((product) => (
                    <ProductRow
                      key={product.id}
                      product={product}
                      canManage={canManage}
                      onEdit={() => openProduct(product)}
                      onToggle={() =>
                        run(() => toggleProductAvailability(product.id, !product.available))
                      }
                      onDelete={() => run(() => deleteProduct(product.id))}
                    />
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {categories.some((c) => grouped.every((g) => g.category.id !== c.id)) && (
            <p className="text-sm text-muted-foreground">Hay categorías sin productos.</p>
          )}
        </div>
      )}

      {/* Categoría */}
      <Dialog open={categoryOpen} onOpenChange={setCategoryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCategory ? "Editar categoría" : "Nueva categoría"}</DialogTitle>
            <DialogDescription>Se aplica a todos los productos de la sucursal.</DialogDescription>
          </DialogHeader>
          <form action={submitCategory} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="grid gap-4 sm:grid-cols-[1fr_100px]">
              <div className="space-y-2">
                <Label htmlFor="cat-name">Nombre *</Label>
                <Input
                  id="cat-name"
                  name="name"
                  value={categoryDraft.name}
                  onChange={(e) => setCategoryDraft({ ...categoryDraft, name: e.target.value })}
                  placeholder="Hamburguesas"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cat-icon">Ícono</Label>
                <Input
                  id="cat-icon"
                  name="icon"
                  maxLength={8}
                  value={categoryDraft.icon}
                  onChange={(e) => setCategoryDraft({ ...categoryDraft, icon: e.target.value })}
                  placeholder="🍔"
                />
              </div>
            </div>
            <input type="hidden" name="active" value={categoryDraft.active ? "on" : "off"} />
            <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
              <Label htmlFor="cat-active">Categoría activa</Label>
              <Switch
                id="cat-active"
                checked={categoryDraft.active}
                onCheckedChange={(checked) =>
                  setCategoryDraft({ ...categoryDraft, active: Boolean(checked) })
                }
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setCategoryOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="size-4 animate-spin" />}
                Guardar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Producto */}
      <Dialog open={productOpen} onOpenChange={setProductOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto scroll-thin">
          <DialogHeader>
            <DialogTitle>{editingProduct ? "Editar producto" : "Nuevo producto"}</DialogTitle>
            <DialogDescription>El precio se guarda al momento de la venta.</DialogDescription>
          </DialogHeader>
          <form action={submitProduct} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="prod-name">Nombre *</Label>
              <Input
                id="prod-name"
                name="name"
                value={productDraft.name}
                onChange={(e) => setProductDraft({ ...productDraft, name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prod-desc">Descripción</Label>
              <Textarea
                id="prod-desc"
                name="description"
                rows={2}
                value={productDraft.description}
                onChange={(e) => setProductDraft({ ...productDraft, description: e.target.value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="prod-cat">Categoría</Label>
                <select
                  id="prod-cat"
                  name="category_id"
                  value={productDraft.category_id}
                  onChange={(e) => setProductDraft({ ...productDraft, category_id: e.target.value })}
                  className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
                >
                  <option value="">Sin categoría</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="prod-price">Precio *</Label>
                <Input
                  id="prod-price"
                  name="price"
                  inputMode="decimal"
                  value={productDraft.price}
                  onChange={(e) => setProductDraft({ ...productDraft, price: e.target.value })}
                  placeholder="3500"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prod-delivery">Precio delivery</Label>
                <Input
                  id="prod-delivery"
                  name="delivery_price"
                  inputMode="decimal"
                  value={productDraft.delivery_price}
                  onChange={(e) => setProductDraft({ ...productDraft, delivery_price: e.target.value })}
                  placeholder="Opcional"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prod-sku">Código / SKU</Label>
                <Input
                  id="prod-sku"
                  name="sku"
                  value={productDraft.sku}
                  onChange={(e) => setProductDraft({ ...productDraft, sku: e.target.value })}
                  placeholder="Opcional"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prod-prep">Preparación (min)</Label>
                <Input
                  id="prod-prep"
                  name="prep_time_minutes"
                  inputMode="numeric"
                  value={productDraft.prep_time_minutes}
                  onChange={(e) =>
                    setProductDraft({ ...productDraft, prep_time_minutes: e.target.value })
                  }
                  placeholder="Opcional"
                />
              </div>
            </div>

            <input type="hidden" name="available" value={productDraft.available ? "on" : "off"} />
            <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
              <Label htmlFor="prod-available">Disponible para venta</Label>
              <Switch
                id="prod-available"
                checked={productDraft.available}
                onCheckedChange={(checked) =>
                  setProductDraft({ ...productDraft, available: Boolean(checked) })
                }
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setProductOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="size-4 animate-spin" />}
                Guardar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProductRow({
  product,
  canManage,
  onEdit,
  onToggle,
  onDelete,
}: {
  product: Product;
  canManage: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="flex items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {product.name}
          {!product.available && (
            <Badge variant="outline" className="ml-2 border-warning text-warning">
              No disponible
            </Badge>
          )}
          {product.sku && <span className="ml-2 text-xs text-muted-foreground">{product.sku}</span>}
        </p>
        {product.description && (
          <p className="truncate text-xs text-muted-foreground">{product.description}</p>
        )}
      </div>
      <span className="shrink-0 text-sm font-semibold tabular-nums">
        {formatMoney(Number(product.price))}
      </span>
      {canManage && (
        <div className="flex shrink-0 items-center gap-1">
          <Switch checked={product.available} onCheckedChange={onToggle} aria-label="Disponible" />
          <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label="Editar">
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onDelete}
            aria-label="Eliminar"
            className="text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      )}
    </li>
  );
}
