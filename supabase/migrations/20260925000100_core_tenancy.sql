-- ============================================================
-- RESTOVA · 000001 Core tenancy
-- Organizations, branches, profiles, members, subscriptions
-- ============================================================

create type public.user_role as enum ('admin', 'encargado', 'mozo', 'caja', 'cocina');
create type public.subscription_status as enum ('trial', 'active', 'expired', 'suspended', 'cancelled');

-- ------------------------------------------------------------
-- Small helpers (no table dependencies)
-- ------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.role_rank(r public.user_role)
returns int
language sql
immutable
as $$
  select case r
    when 'admin'     then 5
    when 'encargado' then 4
    when 'caja'      then 3
    when 'mozo'      then 2
    when 'cocina'    then 1
  end;
$$;

-- ------------------------------------------------------------
-- organizations
-- ------------------------------------------------------------

create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 2 and 120),
  legal_name  text check (legal_name is null or char_length(legal_name) <= 160),
  tax_id      text check (tax_id is null or char_length(tax_id) <= 32),
  email       text,
  phone       text,
  address     text,
  logo_url    text,
  settings    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index organizations_deleted_idx on public.organizations (deleted_at) where deleted_at is null;

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- branches (sucursales)
-- ------------------------------------------------------------

create table public.branches (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 120),
  address    text,
  phone      text,
  email      text,
  timezone   text not null default 'America/Argentina/Buenos_Aires',
  settings   jsonb not null default '{}'::jsonb,
  is_main    boolean not null default false,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index branches_one_main_per_org on public.branches (org_id) where is_main;
create index branches_org_idx on public.branches (org_id) where deleted_at is null;

create trigger branches_set_updated_at
  before update on public.branches
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- profiles (1:1 with auth.users)
-- ------------------------------------------------------------

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text,
  phone      text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'phone', '')), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- org_members (tenant membership + role)
-- ------------------------------------------------------------

create table public.org_members (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       public.user_role not null,
  branch_id  uuid references public.branches (id) on delete set null,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint org_members_org_user_uq unique (org_id, user_id)
);

create index org_members_user_idx on public.org_members (user_id);
create index org_members_org_role_idx on public.org_members (org_id, role) where active;

create trigger org_members_set_updated_at
  before update on public.org_members
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- subscriptions
-- ------------------------------------------------------------

create table public.subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null unique references public.organizations (id) on delete cascade,
  status               public.subscription_status not null default 'trial',
  plan                 text not null default 'standard',
  trial_start          timestamptz not null default now(),
  trial_end            timestamptz not null default (now() + interval '3 months'),
  current_period_start timestamptz,
  current_period_end   timestamptz,
  provider             text,
  cancel_at_period_end boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

create table public.subscription_payments (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations (id) on delete cascade,
  subscription_id uuid references public.subscriptions (id) on delete cascade,
  provider        text not null,
  amount          numeric(12, 2) not null check (amount >= 0),
  currency        text not null default 'ARS',
  status          text not null default 'pending',
  external_id     text,
  payload         jsonb not null default '{}'::jsonb,
  paid_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index subscription_payments_org_idx on public.subscription_payments (org_id, created_at desc);


-- ------------------------------------------------------------
-- Access helpers (declared after the tables they read)
-- ------------------------------------------------------------

create or replace function public.is_member(_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.org_members m
     where m.org_id = _org_id
       and m.user_id = auth.uid()
       and m.active
  );
$$;

create or replace function public.has_role(_org_id uuid, _roles public.user_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.org_members m
     where m.org_id = _org_id
       and m.user_id = auth.uid()
       and m.active
       and m.role = any (_roles)
  );
$$;

create or replace function public.is_org_companion(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.org_members mine
      join public.org_members theirs on theirs.org_id = mine.org_id
     where mine.user_id = auth.uid()
       and mine.active
       and theirs.user_id = _user_id
       and theirs.active
  );
$$;

create or replace function public.my_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id
    from public.org_members
   where user_id = auth.uid()
     and active
   order by created_at
   limit 1;
$$;

revoke all on function public.is_member(uuid) from public, anon;
revoke all on function public.has_role(uuid, public.user_role[]) from public, anon;
revoke all on function public.is_org_companion(uuid) from public, anon;
revoke all on function public.my_org_id() from public, anon;
revoke all on function public.set_updated_at() from public, anon;
revoke all on function public.role_rank(public.user_role) from public, anon;

grant execute on function public.is_member(uuid) to authenticated, service_role;
grant execute on function public.has_role(uuid, public.user_role[]) to authenticated, service_role;
grant execute on function public.is_org_companion(uuid) to authenticated, service_role;
grant execute on function public.my_org_id() to authenticated, service_role;

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------

alter table public.organizations       enable row level security;
alter table public.branches            enable row level security;
alter table public.profiles            enable row level security;
alter table public.org_members         enable row level security;
alter table public.subscriptions       enable row level security;
alter table public.subscription_payments enable row level security;

-- organizations: created exclusively by the registration RPC.
create policy organizations_select_member on public.organizations
  for select to authenticated using (public.is_member(id));

create policy organizations_update_admin on public.organizations
  for update to authenticated
  using (public.has_role(id, array['admin']::public.user_role[]))
  with check (public.has_role(id, array['admin']::public.user_role[]));

-- branches
create policy branches_select_member on public.branches
  for select to authenticated using (public.is_member(org_id));

create policy branches_insert_admin on public.branches
  for insert to authenticated
  with check (public.has_role(org_id, array['admin']::public.user_role[]));

create policy branches_update_admin on public.branches
  for update to authenticated
  using (public.has_role(org_id, array['admin']::public.user_role[]))
  with check (public.has_role(org_id, array['admin']::public.user_role[]));

create policy branches_delete_admin on public.branches
  for delete to authenticated using (public.has_role(org_id, array['admin']::public.user_role[]));

-- profiles
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());

create policy profiles_select_companion on public.profiles
  for select to authenticated using (public.is_org_companion(id));

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- org_members
create policy org_members_select on public.org_members
  for select to authenticated using (user_id = auth.uid() or public.is_member(org_id));

create policy org_members_insert_admin on public.org_members
  for insert to authenticated
  with check (public.has_role(org_id, array['admin']::public.user_role[]));

create policy org_members_update_admin on public.org_members
  for update to authenticated
  using (public.has_role(org_id, array['admin']::public.user_role[]))
  with check (public.has_role(org_id, array['admin']::public.user_role[]));

create policy org_members_delete_admin on public.org_members
  for delete to authenticated using (public.has_role(org_id, array['admin']::public.user_role[]));

-- subscriptions (read-only for members, writes happen through payment RPCs)
create policy subscriptions_select_member on public.subscriptions
  for select to authenticated using (public.is_member(org_id));

create policy subscription_payments_select_member on public.subscription_payments
  for select to authenticated using (public.is_member(org_id));
