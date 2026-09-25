-- ============================================================
-- RESTOVA · 00000450 Operating guard
-- Trial vigente o suscripción activa habilitan la operación.
-- Used by RLS write policies and by the operational RPCs.
-- ============================================================

create or replace function public.can_operate(_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when s.status in ('suspended', 'cancelled') and s.trial_end <= now() then false
    when s.trial_end > now() then true
    when s.status = 'active'
         and (s.current_period_end is null or s.current_period_end > now()) then true
    else false
  end
  from public.subscriptions s
  where s.org_id = _org_id;
$$;

create or replace function public.assert_can_operate(_org_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_operate(_org_id) then
    raise exception 'subscription_expired';
  end if;
end;
$$;

revoke all on function public.can_operate(uuid) from public, anon;
revoke all on function public.assert_can_operate(uuid) from public, anon;
grant execute on function public.can_operate(uuid) to authenticated, service_role;
grant execute on function public.assert_can_operate(uuid) to authenticated, service_role;
