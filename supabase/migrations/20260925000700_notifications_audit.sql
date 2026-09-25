-- ============================================================
-- RESTOVA · 000007 Notifications & audit trail
-- ============================================================

create type public.notification_type as enum (
  'order_new', 'order_ready', 'table_awaiting_payment',
  'cash_opened', 'cash_closed',
  'subscription_soon', 'subscription_expired',
  'system'
);

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  branch_id  uuid references public.branches (id) on delete cascade,
  user_id    uuid references auth.users (id) on delete cascade,
  type       public.notification_type not null default 'system',
  title      text not null,
  body       text,
  data       jsonb not null default '{}'::jsonb,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_org_idx on public.notifications (org_id, created_at desc);
create index notifications_user_idx on public.notifications (user_id, created_at desc)
  where read_at is null;

create table public.audit_logs (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  user_id    uuid references auth.users (id) on delete set null,
  action     text not null,
  entity     text not null,
  entity_id  uuid,
  data       jsonb not null default '{}'::jsonb,
  ip         text,
  created_at timestamptz not null default now()
);

create index audit_logs_org_idx on public.audit_logs (org_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs (org_id, entity, entity_id);

-- The actor is always the authenticated caller: never client-supplied.
create or replace function public.stamp_audit_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.user_id := auth.uid();
  new.org_id := coalesce(new.org_id, public.my_org_id());
  return new;
end;
$$;

create trigger audit_logs_stamp_actor
  before insert on public.audit_logs
  for each row execute function public.stamp_audit_actor();

alter table public.notifications enable row level security;
alter table public.audit_logs    enable row level security;

-- Notifications: own or broadcast inside the tenant.
create policy notifications_select on public.notifications
  for select to authenticated
  using (public.is_member(org_id) and (user_id is null or user_id = auth.uid()));

create policy notifications_insert_member on public.notifications
  for insert to authenticated
  with check (public.is_member(org_id) and (user_id is null or user_id = auth.uid()));

create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy notifications_delete_own on public.notifications
  for delete to authenticated using (user_id = auth.uid());

-- Audit: anyone in the tenant can write (actor is stamped server-side),
-- only managers can read it.
create policy audit_logs_insert_member on public.audit_logs
  for insert to authenticated
  with check (public.is_member(org_id));

create policy audit_logs_select_manager on public.audit_logs
  for select to authenticated
  using (
    public.is_member(org_id)
    and public.has_role(org_id, array['admin', 'encargado']::public.user_role[])
  );

alter publication supabase_realtime add table public.notifications;
