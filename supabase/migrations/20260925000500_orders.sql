-- ============================================================
-- RESTOVA · 000005 Orders & comandas
-- orders, order_items, order_item_modifiers, numbering
-- ============================================================

create type public.order_channel as enum ('salon', 'delivery', 'pickup', 'phone', 'web');
create type public.order_status as enum (
  'draft', 'sent', 'received', 'preparing', 'ready', 'delivered', 'cancelled', 'paid'
);
create type public.order_item_status as enum ('pending', 'preparing', 'ready', 'served', 'cancelled');

create table public.orders (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations (id) on delete cascade,
  branch_id         uuid not null references public.branches (id) on delete cascade,
  order_number      int not null,
  order_day         date not null default current_date,
  table_session_id  uuid references public.table_sessions (id) on delete set null,
  customer_id       uuid references public.customers (id) on delete set null,
  waiter_id         uuid references auth.users (id) on delete set null,
  channel           public.order_channel not null default 'salon',
  status            public.order_status not null default 'draft',
  subtotal          numeric(12, 2) not null default 0 check (subtotal >= 0),
  discount_amount   numeric(12, 2) not null default 0 check (discount_amount >= 0),
  tax_amount        numeric(12, 2) not null default 0 check (tax_amount >= 0),
  total             numeric(12, 2) not null default 0 check (total >= 0),
  notes             text,
  created_by        uuid not null references auth.users (id),
  sent_at           timestamptz,
  ready_at          timestamptz,
  delivered_at      timestamptz,
  paid_at           timestamptz,
  cancelled_at      timestamptz,
  cancelled_by      uuid references auth.users (id),
  cancel_reason     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint orders_number_uq unique (branch_id, order_day, order_number)
);

create index orders_branch_status_idx on public.orders (branch_id, status, sent_at desc);
create index orders_session_idx on public.orders (table_session_id) where table_session_id is not null;
create index orders_waiter_day_idx on public.orders (waiter_id, order_day desc);
create index orders_customer_idx on public.orders (customer_id) where customer_id is not null;
create index orders_day_idx on public.orders (branch_id, order_day desc);

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- Correlativo de comanda por sucursal y día (optimistic counter).
create table public.order_counters (
  branch_id   uuid not null references public.branches (id) on delete cascade,
  order_day   date not null default current_date,
  last_number int not null default 0,
  primary key (branch_id, order_day)
);

-- ------------------------------------------------------------
-- Items (price snapshots: historical sales never change)
-- ------------------------------------------------------------

create table public.order_items (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations (id) on delete cascade,
  order_id        uuid not null references public.orders (id) on delete cascade,
  product_id      uuid references public.products (id) on delete set null,
  name_snapshot   text not null,
  unit_price      numeric(12, 2) not null default 0 check (unit_price >= 0),
  modifier_total  numeric(12, 2) not null default 0,
  quantity        int not null default 1 check (quantity > 0),
  subtotal        numeric(12, 2) not null default 0 check (subtotal >= 0),
  notes           text,
  status          public.order_item_status not null default 'pending',
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index order_items_order_idx on public.order_items (order_id, sort_order);
create index order_items_product_idx on public.order_items (product_id);

create trigger order_items_set_updated_at
  before update on public.order_items
  for each row execute function public.set_updated_at();

create table public.order_item_modifiers (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations (id) on delete cascade,
  order_item_id      uuid not null references public.order_items (id) on delete cascade,
  modifier_option_id uuid references public.modifier_options (id) on delete set null,
  name_snapshot      text not null,
  price_delta        numeric(12, 2) not null default 0,
  quantity           int not null default 1 check (quantity > 0),
  created_at         timestamptz not null default now()
);

create index order_item_modifiers_item_idx on public.order_item_modifiers (order_item_id);

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------

alter table public.orders              enable row level security;
alter table public.order_items         enable row level security;
alter table public.order_item_modifiers enable row level security;

create policy orders_select_member on public.orders
  for select to authenticated using (public.is_member(org_id));

create policy orders_insert_floor on public.orders
  for insert to authenticated
  with check (
    public.is_member(org_id)
    and public.can_operate(org_id)
    and public.has_role(org_id, array['admin', 'encargado', 'mozo', 'caja']::public.user_role[])
  );

create policy orders_update_floor on public.orders
  for update to authenticated
  using (
    public.is_member(org_id)
    and public.has_role(org_id, array['admin', 'encargado', 'mozo', 'caja', 'cocina']::public.user_role[])
  )
  with check (public.is_member(org_id));

create policy orders_delete_admin on public.orders
  for delete to authenticated
  using (
    public.is_member(org_id)
    and public.has_role(org_id, array['admin']::public.user_role[])
  );

create policy order_items_select_member on public.order_items
  for select to authenticated using (public.is_member(org_id));

create policy order_items_insert_floor on public.order_items
  for insert to authenticated
  with check (
    public.is_member(org_id)
    and public.can_operate(org_id)
    and public.has_role(org_id, array['admin', 'encargado', 'mozo', 'caja']::public.user_role[])
  );

create policy order_items_update_floor on public.order_items
  for update to authenticated
  using (
    public.is_member(org_id)
    and public.has_role(org_id, array['admin', 'encargado', 'mozo', 'caja', 'cocina']::public.user_role[])
  )
  with check (public.is_member(org_id));

create policy order_items_delete_order_writer on public.order_items
  for delete to authenticated
  using (
    public.is_member(org_id)
    and public.has_role(org_id, array['admin', 'encargado', 'mozo']::public.user_role[])
  );

create policy order_item_modifiers_select_member on public.order_item_modifiers
  for select to authenticated using (public.is_member(org_id));

create policy order_item_modifiers_insert_floor on public.order_item_modifiers
  for insert to authenticated
  with check (
    public.is_member(org_id)
    and public.can_operate(org_id)
    and public.has_role(org_id, array['admin', 'encargado', 'mozo', 'caja']::public.user_role[])
  );

create policy order_item_modifiers_delete_floor on public.order_item_modifiers
  for delete to authenticated
  using (
    public.is_member(org_id)
    and public.has_role(org_id, array['admin', 'encargado', 'mozo']::public.user_role[])
  );

-- ------------------------------------------------------------
-- Realtime: KDS and floor screens subscribe to these tables
-- ------------------------------------------------------------

alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.order_items;
alter publication supabase_realtime add table public.table_sessions;
alter publication supabase_realtime add table public.dining_tables;

-- ------------------------------------------------------------
-- Integrity: totals are derived in the database, never trusted
-- from the client.
-- ------------------------------------------------------------

create or replace function public.calc_order_item_subtotal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.subtotal := (coalesce(new.unit_price, 0) + coalesce(new.modifier_total, 0)) * new.quantity;
  return new;
end;
$$;

create trigger order_items_calc_subtotal
  before insert or update of unit_price, modifier_total, quantity on public.order_items
  for each row execute function public.calc_order_item_subtotal();

create or replace function public.calc_order_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.total := greatest(
    0,
    coalesce(new.subtotal, 0) - coalesce(new.discount_amount, 0) + coalesce(new.tax_amount, 0)
  );
  return new;
end;
$$;

create trigger orders_calc_total
  before insert or update on public.orders
  for each row execute function public.calc_order_total();

create or replace function public.refresh_order_totals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _order_id uuid;
begin
  if tg_op = 'DELETE' then
    _order_id := old.order_id;
  else
    _order_id := new.order_id;
  end if;

  update public.orders o
     set subtotal = coalesce(
           (select sum(i.subtotal) from public.order_items i where i.order_id = _order_id), 0)
   where o.id = _order_id;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger order_items_refresh_totals
  after insert or update or delete on public.order_items
  for each row execute function public.refresh_order_totals();
