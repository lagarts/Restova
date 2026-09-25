-- ============================================================
-- RESTOVA · 000002 Registration RPC
-- Creates organization + main branch + trial + admin member
-- in a single transaction. No client INSERT policy on purpose:
-- tenancy roots are only ever created here.
-- ============================================================

create or replace function public.register_organization(
  _name text,
  _phone text default null,
  _address text default null,
  _email text default null,
  _branch_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid      uuid := auth.uid();
  _org_id   uuid;
  _branch_id uuid;
  _clean    text := nullif(btrim(coalesce(_name, '')), '');
begin
  if _uid is null then
    raise exception 'not_authenticated';
  end if;

  if exists (
    select 1 from public.org_members
     where user_id = _uid and active
  ) then
    raise exception 'already_registered';
  end if;

  if _clean is null or char_length(_clean) < 2 then
    raise exception 'invalid_business_name';
  end if;

  insert into public.organizations (name, phone, address, email)
  values (_clean, nullif(btrim(coalesce(_phone, '')), ''), nullif(btrim(coalesce(_address, '')), ''),
          nullif(btrim(coalesce(_email, '')), ''))
  returning id into _org_id;

  insert into public.branches (org_id, name, is_main)
  values (
    _org_id,
    coalesce(nullif(btrim(coalesce(_branch_name, '')), ''), 'Sucursal principal'),
    true
  )
  returning id into _branch_id;

  insert into public.subscriptions (org_id, status, trial_start, trial_end)
  values (_org_id, 'trial', now(), now() + interval '3 months');

  insert into public.org_members (org_id, user_id, role, branch_id)
  values (_org_id, _uid, 'admin', _branch_id);

  return _org_id;
end;
$$;

revoke all on function public.register_organization(text, text, text, text, text) from public, anon;
grant execute on function public.register_organization(text, text, text, text, text) to authenticated;
