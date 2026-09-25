-- ============================================================
-- RESTOVA · 000004 Floor & customers
-- dining_tables, table_sessions, customers
-- ============================================================

create table public.dining_tables (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  branch_id  uuid not null references public.branches (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 40),
  capacity   int not null default 4 check (capacity > 0),
  sector     text not null default 'Salón',
  pos_x      numeric(8, 2) not null default 0,
  pos_y      numeric(8, 2) not null default 0,
  width      int not null default 1 check (width > 0),
  height     int not null default 1 check (height > 0),
  sort_order int not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index dining_tables_branch_idx on public.dining_tables (branch_id, sort_order)
  where deleted_at is null;

create trigger dining_tables_set_updated_at
  before update on public.dining_tables
  for each row execute function public.set_updated_at();

create type public.session_status as enum ('open', 'awaiting_payment', 'closed');

create table public.table_sessions (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  branch_id   uuid not null references public.branches (id) on delete cascade,
  table_id    uuid not null references public.dining_tables (id) on delete cascade,
  opened_by   uuid not null references auth.users (id),
  waiter_id   uuid references auth.users (id) on delete set null,
  status      public.session_status not null default 'open',
  guest_count int check (guest_count is null or guest_count >= 0),
  notes       text,
  opened_at   timestamptz not null default now(),
  closed_at   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index table_sessions_one_open_per_table
  on public.table_sessions (table_id) where status <> 'closed';
create index table_sessions_branch_idx on public.table_sessions (branch_id, status);
create index table_sessions_waiter_idx on public.table_sessions (waiter_id) where status <> 'closed';

create trigger table_sessions_set_updated_at
  before update on public.table_sessions
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- customers (org-wide, shared by all branches)
-- ------------------------------------------------------------

create table public.customers (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 120),
  phone         text,
  email         text,
  address       text,
  notes         text,
  orders_count  int not null default 0,
  total_spent   numeric(12, 2) not null default 0,
  last_order_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create index customers_org_idx on public.customers (org_id) where deleted_at is null;
create index customers_org_name_idx on public.customers (org_id, upper(name)) where deleted_at is null;
create unique index customers_org_phone_uq on public.customers (org_id, phone)
  where phone is not null and deleted_at is null;

create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------

alter table public.dining_tables  enable row level security;
alter table public.table_sessions enable row level security;
alter table public.customers      enable row level security;

create policy dining_tables_select_member on public.dining_tables
  for select to authenticated using (public.is_member(org_id));

create policy dining_tables_write_manager on public.dining_tables
  for insert to authenticated
  with check (
    public.is_member(org_id)
    and public.has_role(org_id, array['admin', 'encargado']::public.user_role[])
  );

create policy dining_tables_update_manager on public.dining_tables
  for update to authenticated
  using (
    public.is_member(org_id)
    and public.has_role(org_id, array['admin', 'encargado']::public.user_role[])
  )
  with check (public.is_member(org_id));

create policy dining_tables_delete_admin on public.dining_tables
  for delete to authenticated
  using (
    public.is_member(org_id)
    and public.has_role(org_id, array['admin']::public.user_role[])
  );

-- Sessions: the floor staff creates and works them.
create policy table_sessions_select_member on public.table_sessions
  for select to authenticated using (public.is_member(org_id));

create policy table_sessions_insert_floor on public.table_sessions
  for insert to authenticated
  with check (
    public.is_member(org_id)
    and public.has_role(org_id, array['admin', 'encargado', 'mozo', 'caja']::public.user_role[])
  );

create policy table_sessions_update_floor on public.table_sessions
  for update to authenticated
  using (
    public.is_member(org_id)
    and public.has_role(org_id, array['admin', 'encargado', 'mozo', 'caja']::public.user_role[])
  )
  with check (public.is_member(org_id));

create policy table_sessions_delete_admin on public.table_sessions
  for delete to authenticated
  using (
    public.is_member(org_id)
    and public.has_role(org_id, array['admin']::public.user_role[])
  );

-- customers
create policy customers_select_member on public.customers
  for select to authenticated using (public.is_member(org_id));

create policy customers_insert_floor on public.customers
  for insert to authenticated
  with check (
    public.is_member(org_id)
    and public.has_role(org_id, array['admin', 'encargado', 'caja', 'mozo']::public.user_role[])
  );

create policy customers_update_floor on public.customers
  for update to authenticated
  using (
    public.is_member(org_id)
    and public.has_role(org_id, array['admin', 'encargado', 'caja']::public.user_role[])
  )
  with check (public.is_member(org_id));

create policy customers_delete_admin on public.customers
  for delete to authenticated
  using (
    public.is_member(org_id)
    and public.has_role(org_id, array['admin']::public.user_role[])
  );
