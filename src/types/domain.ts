import type { Role } from "@/lib/auth/rbac";

export type SubscriptionStatus = "trial" | "active" | "expired" | "suspended" | "cancelled";

export type OrderChannel = "salon" | "delivery" | "pickup" | "phone" | "web";

export type OrderStatus =
  | "draft"
  | "sent"
  | "received"
  | "preparing"
  | "ready"
  | "delivered"
  | "cancelled"
  | "paid";

export type OrderItemStatus = "pending" | "preparing" | "ready" | "served" | "cancelled";

export type SessionStatus = "open" | "awaiting_payment" | "closed";

export type CashRegisterStatus = "open" | "closed";

export type CashMovementType =
  | "opening"
  | "sale"
  | "income"
  | "expense"
  | "refund"
  | "withdrawal"
  | "adjustment"
  | "closing";

export type PaymentMethod = "cash" | "card" | "transfer" | "mercadopago" | "paypal" | "other";

export interface Organization {
  id: string;
  name: string;
  legal_name: string | null;
  tax_id: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  logo_url: string | null;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Branch {
  id: string;
  org_id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  timezone: string;
  settings: Record<string, unknown>;
  is_main: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Profile {
  id: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrgMember {
  id: string;
  org_id: string;
  user_id: string;
  role: Role;
  branch_id: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id: string;
  org_id: string;
  status: SubscriptionStatus;
  plan: string;
  trial_start: string;
  trial_end: string;
  current_period_start: string | null;
  current_period_end: string | null;
  provider: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  org_id: string;
  branch_id: string;
  name: string;
  icon: string | null;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Product {
  id: string;
  org_id: string;
  branch_id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  image_url: string | null;
  price: number;
  delivery_price: number | null;
  sku: string | null;
  available: boolean;
  track_stock: boolean;
  stock: number | null;
  min_stock: number | null;
  tax_rate: number;
  prep_time_minutes: number | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ModifierOption {
  id: string;
  org_id: string;
  group_id: string;
  name: string;
  price_delta: number;
  available: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ModifierGroup {
  id: string;
  org_id: string;
  branch_id: string;
  name: string;
  required: boolean;
  min_select: number;
  max_select: number;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  options: ModifierOption[];
}

export interface DiningTable {
  id: string;
  org_id: string;
  branch_id: string;
  name: string;
  capacity: number;
  sector: string;
  pos_x: number;
  pos_y: number;
  width: number;
  height: number;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface TableSession {
  id: string;
  org_id: string;
  branch_id: string;
  table_id: string;
  opened_by: string;
  waiter_id: string | null;
  status: SessionStatus;
  guest_count: number | null;
  notes: string | null;
  opened_at: string;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  org_id: string;
  branch_id: string;
  order_number: number;
  order_day: string;
  table_session_id: string | null;
  customer_id: string | null;
  waiter_id: string | null;
  channel: OrderChannel;
  status: OrderStatus;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total: number;
  notes: string | null;
  created_by: string;
  sent_at: string | null;
  ready_at: string | null;
  delivered_at: string | null;
  paid_at: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  org_id: string;
  order_id: string;
  product_id: string | null;
  name_snapshot: string;
  unit_price: number;
  modifier_total: number;
  quantity: number;
  subtotal: number;
  notes: string | null;
  status: OrderItemStatus;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  org_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  orders_count: number;
  total_spent: number;
  last_order_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CashRegister {
  id: string;
  org_id: string;
  branch_id: string;
  opened_by: string;
  closed_by: string | null;
  opening_amount: number;
  declared_closing_amount: number | null;
  expected_closing_amount: number | null;
  difference: number | null;
  notes: string | null;
  status: CashRegisterStatus;
  opened_at: string;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CashMovement {
  id: string;
  org_id: string;
  branch_id: string;
  cash_register_id: string;
  type: CashMovementType;
  method: PaymentMethod | null;
  amount: number;
  concept: string;
  sale_id: string | null;
  order_id: string | null;
  user_id: string | null;
  created_at: string;
}

export interface Sale {
  id: string;
  org_id: string;
  branch_id: string;
  cash_register_id: string | null;
  order_id: string | null;
  receipt_number: number;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total: number;
  channel: OrderChannel;
  waiter_id: string | null;
  customer_id: string | null;
  created_by: string;
  paid_at: string;
  created_at: string;
}

export interface SalePayment {
  id: string;
  org_id: string;
  sale_id: string;
  method: PaymentMethod;
  amount: number;
  created_at: string;
}
