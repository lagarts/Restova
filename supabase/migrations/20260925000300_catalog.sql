-- ============================================================
-- RESTOVA · 000003 Catalog
-- Categories, products, modifier groups & options
-- ============================================================

create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  branch_id  uuid not null references public.branches (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 80),
  icon       text,
  sort_order int not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index categories_branch_idx on public.categories (branch_id, sort_order)
  where deleted_at is null;

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

create table public.products (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations (id) on delete cascade,
  branch_id         uuid not null references public.branches (id) on delete cascade,
  category_id       uuid references public.categories (id) on delete set null,
  name              text not null check (char_length(name) between 1 and 120),
  description       text,
  image_url         text,
  price             numeric(12, 2) not null default 0 check (price >= 0),
  delivery_price    numeric(12, 2) check (delivery_price is null or delivery_price >= 0),
  sku               text,
  available         boolean not null default true,
  track_stock       boolean not null default false,
  stock             numeric(12, 3),
  min_stock         numeric(12, 3),
  tax_rate          numeric(5, 2) not null default 0 check (tax_rate >= 0 and tax_rate <= 100),
  prep_time_minutes int check (prep_time_minutes is null or prep_time_minutes > 0),
  sort_order        int not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

create index products_branch_idx on public.products (branch_id, sort_order)
  where deleted_at is null;
create index products_category_idx on public.products (category_id) where deleted_at is null;
create unique index products_branch_sku_uq on public.products (branch_id, upper(sku))
  where sku is not null and deleted_at is null;

create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- Modifiers (extras y modificadores)
-- ------------------------------------------------------------

create table public.modifier_groups (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  branch_id  uuid not null references public.branches (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 80),
  required   boolean not null default false,
  min_select int not null default 0 check (min_select >= 0),
  max_select int not null default 0 check (max_select >= 0),
  sort_order int not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint modifier_groups_select_order_chk check (max_select = 0 or max_select >= min_select)
);

create index modifier_groups_branch_idx on public.modifier_groups (branch_id, sort_order)
  where deleted_at is null;

create trigger modifier_groups_set_updated_at
  before update on public.modifier_groups
  for each row execute function public.set_updated_at();

create table public.modifier_options (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations (id) on delete cascade,
  group_id        uuid not null references public.modifier_groups (id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 80),
  price_delta     numeric(12, 2) not null default 0,
  available       boolean not null default true,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create index modifier_options_group_idx on public.modifier_options (group_id, sort_order)
  where deleted_at is null;

create trigger modifier_options_set_updated_at
  before update on public.modifier_options
  for each row execute function public.set_updated_at();

create table public.product_modifier_groups (
  org_id     uuid not null references public.organizations (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  group_id   uuid not null references public.modifier_groups (id) on delete cascade,
  sort_order int not null default 0,
  primary key (product_id, group_id)
);

create index product_modifier_groups_group_idx on public.product_modifier_groups (group_id);

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------

alter table public.categories            enable row level security;
alter table public.products              enable row level security;
alter table public.modifier_groups       enable row level security;
alter table public.modifier_options      enable row level security;
alter table public.product_modifier_groups enable row level security;

-- Read: every member of the tenant.
-- Write: admin / encargado (and mozo may edit availability on the floor).

create policy categories_select_member on public.categories
  for select to authenticated using (public.is_member(org_id));

create policy categories_write_manager on public.categories
  for insert to authenticated
  with check (
    public.is_member(org_id)
    and public.has_role(org_id, array['admin', 'encargado']::public.user_role[])
  );

create policy categories_update_manager on public.categories
  for update to authenticated
  using (
    public.is_member(org_id)
    and public.has_role(org_id, array['admin', 'encargado']::public.user_role[])
  )
  with check (public.is_member(org_id));

create policy categories_delete_admin on public.categories
  for delete to authenticated
  using (
    public.is_member(org_id)
    and public.has_role(org_id, array['admin']::public.user_role[])
  );

create policy products_select_member on public.products
  for select to authenticated using (public.is_member(org_id));

create policy products_write_manager on public.products
  for insert to authenticated
  with check (
    public.is_member(org_id)
    and public.has_role(org_id, array['admin', 'encargado']::public.user_role[])
  );

create policy products_update_manager on public.products
  for update to authenticated
  using (
    public.is_member(org_id)
    and public.has_role(org_id, array['admin', 'encargado']::public.user_role[])
  )
  with check (public.is_member(org_id));

create policy products_delete_admin on public.products
  for delete to authenticated
  using (
    public.is_member(org_id)
    and public.has_role(org_id, array['admin']::public.user_role[])
  );

create policy modifier_groups_select_member on public.modifier_groups
  for select to authenticated using (public.is_member(org_id));

create policy modifier_groups_write_manager on public.modifier_groups
  for insert to authenticated
  with check (
    public.is_member(org_id)
    and public.has_role(org_id, array['admin', 'encargado']::public.user_role[])
  );

create policy modifier_groups_update_manager on public.modifier_groups
  for update to authenticated
  using (
    public.is_member(org_id)
    and public.has_role(org_id, array['admin', 'encargado']::public.user_role[])
  )
  with check (public.is_member(org_id));

create policy modifier_groups_delete_admin on public.modifier_groups
  for delete to authenticated
  using (
    public.is_member(org_id)
    and public.has_role(org_id, array['admin']::public.user_role[])
  );

create policy modifier_options_select_member on public.modifier_options
  for select to authenticated using (public.is_member(org_id));

create policy modifier_options_write_manager on public.modifier_options
  for insert to authenticated
  with check (
    public.is_member(org_id)
    and public.has_role(org_id, array['admin', 'encargado']::public.user_role[])
  );

create policy modifier_options_update_manager on public.modifier_options
  for update to authenticated
  using (
    public.is_member(org_id)
    and public.has_role(org_id, array['admin', 'encargado']::public.user_role[])
  )
  with check (public.is_member(org_id));

create policy modifier_options_delete_admin on public.modifier_options
  for delete to authenticated
  using (
    public.is_member(org_id)
    and public.has_role(org_id, array['admin']::public.user_role[])
  );

create policy product_modifier_groups_select_member on public.product_modifier_groups
  for select to authenticated using (public.is_member(org_id));

create policy product_modifier_groups_write_manager on public.product_modifier_groups
  for insert to authenticated
  with check (
    public.is_member(org_id)
    and public.has_role(org_id, array['admin', 'encargado']::public.user_role[])
  );

create policy product_modifier_groups_delete_manager on public.product_modifier_groups
  for delete to authenticated
  using (
    public.is_member(org_id)
    and public.has_role(org_id, array['admin', 'encargado']::public.user_role[])
  );
