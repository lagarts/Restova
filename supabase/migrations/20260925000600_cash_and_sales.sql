-- ============================================================
-- RESTOVA · 000006 Cash register & sales
-- cash_registers, cash_movements, sales, sale_payments
-- + operating guard (trial / subscription blocking)
-- + transactional RPCs for open / close / charge
-- ============================================================

create type public.cash_register_status as enum ('open', 'closed');
create type public.cash_movement_type as enum (
  'opening', 'sale', 'income', 'expense', 'refund', 'withdrawal', 'adjustment', 'closing'
);
create type public.payment_method as enum ('cash', 'card', 'transfer', 'mercadopago', 'paypal', 'other');
create type public.sale_status as enum ('paid', 'refunded', 'voided');

-- ------------------------------------------------------------
-- cash_registers
-- ------------------------------------------------------------

create table public.cash_registers (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references public.organizations (id) on delete cascade,
  branch_id              uuid not null references public.branches (id) on delete cascade,
  opened_by              uuid not null references auth.users (id),
  closed_by              uuid references auth.users (id),
  opening_amount         numeric(12, 2) not null default 0 check (opening_amount >= 0),
  declared_closing_amount numeric(12, 2),
  expected_closing_amount numeric(12, 2),
  difference             numeric(12, 2),
  notes                  text,
  status                 public.cash_register_status not null default 'open',
  opened_at              timestamptz not null default now(),
  closed_at              timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create unique index cash_registers_one_open_per_branch
  on public.cash_registers (branch_id) where status = 'open';
create index cash_registers_branch_history_idx on public.cash_registers (branch_id, opened_at desc);

create trigger cash_registers_set_updated_at
  before update on public.cash_registers
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- cash_movements (ledger; amount sign follows the cash flow)
-- ------------------------------------------------------------

create table public.cash_movements (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations (id) on delete cascade,
  branch_id         uuid not null references public.branches (id) on delete cascade,
  cash_register_id  uuid not null references public.cash_registers (id) on delete cascade,
  type              public.cash_movement_type not null,
  method            public.payment_method not null,
  amount            numeric(12, 2) not null,
  concept           text not null default '',
  sale_id           uuid,
  order_id          uuid,
  user_id           uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now()
);

create index cash_movements_register_idx on public.cash_movements (cash_register_id, created_at);
create index cash_movements_sale_idx on public.cash_movements (sale_id) where sale_id is not null;

-- ------------------------------------------------------------
-- sales
-- ------------------------------------------------------------

create table public.sales (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations (id) on delete cascade,
  branch_id         uuid not null references public.branches (id) on delete cascade,
  cash_register_id  uuid not null references public.cash_registers (id) on delete restrict,
  table_session_id  uuid references public.table_sessions (id) on delete set null,
  customer_id       uuid references public.customers (id) on delete set null,
  receipt_number    int not null,
  receipt_day       date not null default current_date,
  status            public.sale_status not null default 'paid',
  subtotal          numeric(12, 2) not null default 0 check (subtotal >= 0),
  discount_amount   numeric(12, 2) not null default 0 check (discount_amount >= 0),
  tax_amount        numeric(12, 2) not null default 0 check (tax_amount >= 0),
  total             numeric(12, 2) not null check (total > 0),
  channel           public.order_channel not null default 'salon',
  waiter_id         uuid references auth.users (id) on delete set null,
  created_by        uuid not null references auth.users (id),
  notes             text,
  paid_at           timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint sales_receipt_uq unique (branch_id, receipt_day, receipt_number)
);

create index sales_branch_day_idx on public.sales (branch_id, paid_at desc);
create index sales_waiter_idx on public.sales (waiter_id, paid_at desc);
create index sales_register_idx on public.sales (cash_register_id);

create trigger sales_set_updated_at
  before update on public.sales
  for each row execute function public.set_updated_at();

create table public.sale_payments (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  sale_id    uuid not null references public.sales (id) on delete cascade,
  method     public.payment_method not null,
  amount     numeric(12, 2) not null check (amount > 0),
  created_at timestamptz not null default now()
);

create index sale_payments_sale_idx on public.sale_payments (sale_id);

create table public.receipt_counters (
  branch_id     uuid not null references public.branches (id) on delete cascade,
  receipt_day   date not null default current_date,
  last_number   int not null default 0,
  primary key (branch_id, receipt_day)
);

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------

alter table public.cash_registers enable row level security;
alter table public.cash_movements  enable row level security;
alter table public.sales           enable row level security;
alter table public.sale_payments   enable row level security;

create policy cash_registers_select_member on public.cash_registers
  for select to authenticated using (public.is_member(org_id));

create policy cash_registers_insert_open on public.cash_registers
  for insert to authenticated
  with check (
    public.is_member(org_id)
    and public.can_operate(org_id)
    and public.has_role(org_id, array['admin', 'encargado', 'caja']::public.user_role[])
  );

create policy cash_registers_update_close on public.cash_registers
  for update to authenticated
  using (
    public.is_member(org_id)
    and public.has_role(org_id, array['admin', 'encargado', 'caja']::public.user_role[])
  )
  with check (public.is_member(org_id));

create policy cash_movements_select_member on public.cash_movements
  for select to authenticated using (public.is_member(org_id));

create policy cash_movements_insert_member on public.cash_movements
  for insert to authenticated
  with check (
    public.is_member(org_id)
    and public.can_operate(org_id)
    and public.has_role(org_id, array['admin', 'encargado', 'caja']::public.user_role[])
  );

create policy sales_select_member on public.sales
  for select to authenticated using (public.is_member(org_id));

create policy sales_insert_member on public.sales
  for insert to authenticated
  with check (
    public.is_member(org_id)
    and public.can_operate(org_id)
    and public.has_role(org_id, array['admin', 'encargado', 'caja']::public.user_role[])
  );

create policy sales_update_member on public.sales
  for update to authenticated
  using (
    public.is_member(org_id)
    and public.has_role(org_id, array['admin', 'encargado', 'caja']::public.user_role[])
  )
  with check (public.is_member(org_id));

create policy sale_payments_select_member on public.sale_payments
  for select to authenticated using (public.is_member(org_id));

create policy sale_payments_insert_member on public.sale_payments
  for insert to authenticated
  with check (
    public.is_member(org_id)
    and public.can_operate(org_id)
    and public.has_role(org_id, array['admin', 'encargado', 'caja']::public.user_role[])
  );

-- ------------------------------------------------------------
-- RPC: abrir caja
-- ------------------------------------------------------------

create or replace function public.open_cash_register(
  _branch_id uuid,
  _opening_amount numeric,
  _notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid    uuid := auth.uid();
  _org_id uuid;
  _id     uuid;
begin
  if _uid is null then
    raise exception 'not_authenticated';
  end if;

  select org_id into _org_id from public.branches where id = _branch_id;
  if _org_id is null then
    raise exception 'branch_not_found';
  end if;

  if not public.is_member(_org_id) then
    raise exception 'not_member';
  end if;

  if not public.has_role(_org_id, array['admin', 'encargado', 'caja']::public.user_role[]) then
    raise exception 'forbidden';
  end if;

  perform public.assert_can_operate(_org_id);

  if _opening_amount is null or _opening_amount < 0 then
    raise exception 'invalid_amount';
  end if;

  insert into public.cash_registers (org_id, branch_id, opened_by, opening_amount, notes)
  values (_org_id, _branch_id, _uid, _opening_amount, nullif(btrim(coalesce(_notes, '')), ''))
  returning id into _id;

  insert into public.cash_movements (org_id, branch_id, cash_register_id, type, method, amount, concept, user_id)
  values (_org_id, _branch_id, _id, 'opening', 'cash', _opening_amount, 'Fondo inicial', _uid);

  return _id;
end;
$$;

-- ------------------------------------------------------------
-- RPC: cerrar caja
-- ------------------------------------------------------------

create or replace function public.close_cash_register(
  _register_id uuid,
  _declared_amount numeric,
  _notes text default null
)
returns table (
  register_id        uuid,
  opening_amount     numeric,
  total_sold         numeric,
  total_cash         numeric,
  total_card         numeric,
  total_transfer     numeric,
  total_mercadopago  numeric,
  total_other        numeric,
  total_income       numeric,
  total_expense      numeric,
  expected_amount    numeric,
  declared_amount    numeric,
  difference         numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid       uuid := auth.uid();
  _org_id    uuid;
  _branch_id uuid;
  _reg       public.cash_registers%rowtype;
  _m         public.cash_movements%rowtype;
  _expected  numeric := 0;
begin
  if _uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into _reg from public.cash_registers where id = _register_id;
  if not found then
    raise exception 'register_not_found';
  end if;

  _org_id := _reg.org_id;
  _branch_id := _reg.branch_id;

  if not public.is_member(_org_id) then
    raise exception 'not_member';
  end if;

  if not public.has_role(_org_id, array['admin', 'encargado', 'caja']::public.user_role[]) then
    raise exception 'forbidden';
  end if;

  if _reg.status <> 'open' then
    raise exception 'register_already_closed';
  end if;

  if _declared_amount is null or _declared_amount < 0 then
    raise exception 'invalid_amount';
  end if;

  -- Expected drawer = opening + every cash movement in cash
  select coalesce(sum(cm.amount), 0)
    into _expected
    from public.cash_movements cm
   where cm.cash_register_id = _register_id
     and cm.method = 'cash';

  update public.cash_registers
     set status = 'closed',
         closed_by = _uid,
         closed_at = now(),
         declared_closing_amount = _declared_amount,
         expected_closing_amount = _expected,
         difference = _declared_amount - _expected,
         notes = coalesce(nullif(btrim(coalesce(_notes, '')), ''), notes)
   where id = _register_id;

  insert into public.cash_movements (org_id, branch_id, cash_register_id, type, method, amount, concept, user_id)
  values (_org_id, _branch_id, _register_id, 'closing', 'cash', 0, 'Cierre de caja', _uid);

  return query
  select
    _register_id,
    _reg.opening_amount,
    (select coalesce(sum(cm.amount), 0) from public.cash_movements cm
      where cm.cash_register_id = _register_id and cm.type = 'sale'),
    (select coalesce(sum(cm.amount), 0) from public.cash_movements cm
      where cm.cash_register_id = _register_id and cm.type = 'sale' and cm.method = 'cash'),
    (select coalesce(sum(cm.amount), 0) from public.cash_movements cm
      where cm.cash_register_id = _register_id and cm.type = 'sale' and cm.method = 'card'),
    (select coalesce(sum(cm.amount), 0) from public.cash_movements cm
      where cm.cash_register_id = _register_id and cm.type = 'sale' and cm.method = 'transfer'),
    (select coalesce(sum(cm.amount), 0) from public.cash_movements cm
      where cm.cash_register_id = _register_id and cm.type = 'sale' and cm.method = 'mercadopago'),
    (select coalesce(sum(cm.amount), 0) from public.cash_movements cm
      where cm.cash_register_id = _register_id and cm.type = 'sale' and cm.method in ('other', 'paypal')),
    (select coalesce(sum(cm.amount), 0) from public.cash_movements cm
      where cm.cash_register_id = _register_id and cm.type = 'income'),
    (select coalesce(sum(cm.amount), 0) from public.cash_movements cm
      where cm.cash_register_id = _register_id and cm.type in ('expense', 'withdrawal')),
    _expected,
    _declared_amount,
    _declared_amount - _expected;
end;
$$;

-- ------------------------------------------------------------
-- RPC: cobrar mesa (venta + pagos divididos + movimientos)
-- ------------------------------------------------------------

create or replace function public.charge_session(
  _session_id uuid,
  _payments jsonb,
  _discount_amount numeric default 0,
  _customer_id uuid default null,
  _notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid       uuid := auth.uid();
  _sess      public.table_sessions%rowtype;
  _register  public.cash_registers%rowtype;
  _sale_id   uuid;
  _subtotal  numeric := 0;
  _total     numeric := 0;
  _paid      numeric := 0;
  _receipt   int;
  _order     public.orders%rowtype;
  _payment   jsonb;
  _method    public.payment_method;
  _amount    numeric;
begin
  if _uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into _sess from public.table_sessions where id = _session_id;
  if not found then
    raise exception 'session_not_found';
  end if;

  if not public.is_member(_sess.org_id) then
    raise exception 'not_member';
  end if;

  if not public.has_role(_sess.org_id, array['admin', 'encargado', 'caja']::public.user_role[]) then
    raise exception 'forbidden';
  end if;

  perform public.assert_can_operate(_sess.org_id);

  if _sess.status = 'closed' then
    raise exception 'session_closed';
  end if;

  if jsonb_typeof(_payments) <> 'array' or jsonb_array_length(_payments) = 0 then
    raise exception 'invalid_payments';
  end if;

  -- Only non-cancelled, not-yet-paid orders are chargeable.
  select coalesce(sum(o.total), 0)
    into _subtotal
    from public.orders o
   where o.table_session_id = _session_id
     and o.status <> 'cancelled'
     and o.status <> 'paid';

  if _subtotal <= 0 then
    raise exception 'nothing_to_charge';
  end if;

  _total := _subtotal - coalesce(_discount_amount, 0);
  if _total <= 0 then
    raise exception 'invalid_total';
  end if;

  -- Payment methods must add up exactly to the total.
  for _payment in select * from jsonb_array_elements(_payments)
  loop
    _method := (_payment ->> 'method')::public.payment_method;
    _amount := (_payment ->> 'amount')::numeric;
    if _method is null or _amount is null or _amount <= 0 then
      raise exception 'invalid_payment';
    end if;
    _paid := _paid + _amount;
  end loop;

  if _paid <> _total then
    raise exception 'payments_do_not_match_total';
  end if;

  select * into _register
    from public.cash_registers
   where branch_id = _sess.branch_id and status = 'open'
   limit 1;

  if not found then
    raise exception 'cash_register_closed';
  end if;

  -- Receipt number
  insert into public.receipt_counters (branch_id, receipt_day, last_number)
  values (_sess.branch_id, current_date, 1)
  on conflict (branch_id, receipt_day)
  do update set last_number = public.receipt_counters.last_number + 1
  returning last_number into _receipt;

  insert into public.sales (
    org_id, branch_id, cash_register_id, table_session_id, customer_id,
    receipt_number, subtotal, discount_amount, total, channel,
    waiter_id, created_by, notes
  )
  values (
    _sess.org_id, _sess.branch_id, _register.id, _session_id, _customer_id,
    _receipt, _subtotal, coalesce(_discount_amount, 0), _total, 'salon',
    _sess.waiter_id, _uid, nullif(btrim(coalesce(_notes, '')), '')
  )
  returning id into _sale_id;

  for _payment in select * from jsonb_array_elements(_payments)
  loop
    _method := (_payment ->> 'method')::public.payment_method;
    _amount := (_payment ->> 'amount')::numeric;

    insert into public.sale_payments (org_id, sale_id, method, amount)
    values (_sess.org_id, _sale_id, _method, _amount);

    insert into public.cash_movements (
      org_id, branch_id, cash_register_id, type, method, amount, concept, sale_id, user_id
    )
    values (
      _sess.org_id, _sess.branch_id, _register.id, 'sale', _method, _amount,
      'Venta mesa #' || coalesce((select name from public.dining_tables where id = _sess.table_id), '?'),
      _sale_id, _uid
    );
  end loop;

  if coalesce(_discount_amount, 0) > 0 then
    insert into public.cash_movements (
      org_id, branch_id, cash_register_id, type, method, amount, concept, sale_id, user_id
    )
    values (
      _sess.org_id, _sess.branch_id, _register.id, 'expense', 'cash',
      -_discount_amount, 'Descuento aplicado', _sale_id, _uid
    );
  end if;

  -- Mark every chargeable order as paid.
  for _order in
    select * from public.orders
     where table_session_id = _session_id and status not in ('cancelled', 'paid')
  loop
    update public.orders
       set status = 'paid', paid_at = now()
     where id = _order.id;

    update public.order_items
       set status = 'served'
     where order_id = _order.id and status <> 'cancelled';
  end loop;

  update public.table_sessions
     set status = 'closed', closed_at = now()
   where id = _session_id;

  -- Customer lifetime counters (same transaction: cannot drift).
  if _customer_id is not null then
    update public.customers
       set orders_count = orders_count + 1,
           total_spent = total_spent + _total,
           last_order_at = now()
     where id = _customer_id and org_id = _sess.org_id;
  end if;

  return _sale_id;
end;
$$;

revoke all on function public.open_cash_register(uuid, numeric, text) from public, anon;
revoke all on function public.close_cash_register(uuid, numeric, text) from public, anon;
revoke all on function public.charge_session(uuid, jsonb, numeric, uuid, text) from public, anon;

grant execute on function public.open_cash_register(uuid, numeric, text) to authenticated;
grant execute on function public.close_cash_register(uuid, numeric, text) to authenticated;
grant execute on function public.charge_session(uuid, jsonb, numeric, uuid, text) to authenticated;

alter publication supabase_realtime add table public.cash_registers;
