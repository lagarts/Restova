-- ============================================================
-- RESTOVA · 000008 Orders API
-- Transactional RPCs for the comanda flow:
-- create draft -> add items -> send to kitchen -> advance items
-- -> delivered. Totals always come from the DB triggers.
-- ============================================================

-- ------------------------------------------------------------
-- Helper (private): insert items + modifiers from jsonb.
-- Not granted to clients: only callable from security definer RPCs.
-- items format:
--   [{"product_id":"uuid","quantity":2,"notes":"sin sal",
--     "modifier_option_ids":["uuid","uuid"]}]
-- ------------------------------------------------------------

create or replace function public._insert_order_items(
  _order_id uuid,
  _org_id   uuid,
  _branch_id uuid,
  _items    jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _item      jsonb;
  _product   public.products%rowtype;
  _item_id   uuid;
  _mod_total numeric;
  _sort      int;
  _opt_id    uuid;
  _opt       public.modifier_options%rowtype;
begin
  _sort := coalesce((select max(sort_order) from public.order_items where order_id = _order_id), 0);

  for _item in select * from jsonb_array_elements(_items)
  loop
    if coalesce((_item ->> 'quantity')::int, 0) < 1
       or coalesce((_item ->> 'quantity')::int, 0) > 99 then
      raise exception 'invalid_quantity';
    end if;

    select * into _product
      from public.products
     where id = (_item ->> 'product_id')::uuid
       and branch_id = _branch_id
       and deleted_at is null
       and available;

    if not found then
      raise exception 'product_not_available';
    end if;

    _mod_total := 0;
    if jsonb_typeof(coalesce(_item -> 'modifier_option_ids', 'null'::jsonb)) = 'array'
       and jsonb_array_length(_item -> 'modifier_option_ids') > 0 then
      select coalesce(sum(o.price_delta), 0)
        into _mod_total
        from public.modifier_options o
       where o.id in (
         select x::uuid from jsonb_array_elements_text(_item -> 'modifier_option_ids') as x
       )
         and o.deleted_at is null
         and o.available;
    end if;

    _sort := _sort + 1;

    insert into public.order_items (
      org_id, order_id, product_id, name_snapshot, unit_price,
      modifier_total, quantity, notes, sort_order
    )
    values (
      _org_id, _order_id, _product.id, _product.name, _product.price,
      _mod_total, (_item ->> 'quantity')::int,
      nullif(btrim(coalesce((_item ->> 'notes')::text, '')), ''), _sort
    )
    returning id into _item_id;

    if jsonb_typeof(coalesce(_item -> 'modifier_option_ids', 'null'::jsonb)) = 'array' then
      for _opt_id in
        select x::uuid from jsonb_array_elements_text(_item -> 'modifier_option_ids') as x
      loop
        select * into _opt
          from public.modifier_options
         where id = _opt_id and deleted_at is null and available;

        if found then
          insert into public.order_item_modifiers (
            org_id, order_item_id, modifier_option_id, name_snapshot, price_delta
          )
          values (_org_id, _item_id, _opt.id, _opt.name, _opt.price_delta);
        end if;
      end loop;
    end if;
  end loop;
end;
$$;

revoke all on function public._insert_order_items(uuid, uuid, uuid, jsonb) from public, anon, authenticated;

-- ------------------------------------------------------------
-- RPC: crear comanda (borrador) para una mesa abierta
-- ------------------------------------------------------------

create or replace function public.create_order(
  _table_session_id uuid,
  _items jsonb,
  _notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid     uuid := auth.uid();
  _sess    public.table_sessions%rowtype;
  _number  int;
  _order   uuid;
begin
  if _uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into _sess from public.table_sessions where id = _table_session_id;
  if not found then
    raise exception 'session_not_found';
  end if;

  if not public.is_member(_sess.org_id) then
    raise exception 'not_member';
  end if;

  if not public.has_role(_sess.org_id, array['admin', 'encargado', 'mozo', 'caja']::public.user_role[]) then
    raise exception 'forbidden';
  end if;

  perform public.assert_can_operate(_sess.org_id);

  if _sess.status = 'closed' then
    raise exception 'session_closed';
  end if;

  if jsonb_typeof(_items) <> 'array' or jsonb_array_length(_items) = 0 then
    raise exception 'empty_order';
  end if;

  insert into public.order_counters (branch_id, order_day, last_number)
  values (_sess.branch_id, current_date, 1)
  on conflict (branch_id, order_day)
  do update set last_number = public.order_counters.last_number + 1
  returning last_number into _number;

  insert into public.orders (
    org_id, branch_id, order_number, table_session_id, waiter_id,
    channel, created_by, notes, status
  )
  values (
    _sess.org_id, _sess.branch_id, _number, _table_session_id,
    coalesce(_sess.waiter_id, _uid), 'salon', _uid,
    nullif(btrim(coalesce(_notes, '')), ''), 'draft'
  )
  returning id into _order;

  perform public._insert_order_items(_order, _sess.org_id, _sess.branch_id, _items);

  return _order;
end;
$$;

-- ------------------------------------------------------------
-- RPC: agregar ítems a una comanda en borrador
-- ------------------------------------------------------------

create or replace function public.add_order_items(
  _order_id uuid,
  _items jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid   uuid := auth.uid();
  _order public.orders%rowtype;
begin
  if _uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into _order from public.orders where id = _order_id;
  if not found then
    raise exception 'order_not_found';
  end if;

  if not public.is_member(_order.org_id) then
    raise exception 'not_member';
  end if;

  if not public.has_role(_order.org_id, array['admin', 'encargado', 'mozo', 'caja']::public.user_role[]) then
    raise exception 'forbidden';
  end if;

  perform public.assert_can_operate(_order.org_id);

  if _order.status <> 'draft' then
    raise exception 'order_already_sent';
  end if;

  if jsonb_typeof(_items) <> 'array' or jsonb_array_length(_items) = 0 then
    raise exception 'empty_order';
  end if;

  perform public._insert_order_items(_order_id, _order.org_id, _order.branch_id, _items);
end;
$$;

-- ------------------------------------------------------------
-- RPC: eliminar un ítem en borrador
-- ------------------------------------------------------------

create or replace function public.remove_order_item(_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid   uuid := auth.uid();
  _item  public.order_items%rowtype;
  _order public.orders%rowtype;
begin
  if _uid is null then
    raise exception 'not_authenticated';
  end if;

  select i.* into _item from public.order_items i where i.id = _item_id;
  if not found then
    raise exception 'item_not_found';
  end if;

  select * into _order from public.orders where id = _item.order_id;
  if not found or not public.is_member(_order.org_id) then
    raise exception 'not_member';
  end if;

  if not public.has_role(_order.org_id, array['admin', 'encargado', 'mozo']::public.user_role[]) then
    raise exception 'forbidden';
  end if;

  if _order.status <> 'draft' then
    raise exception 'order_already_sent';
  end if;

  delete from public.order_items where id = _item_id;
end;
$$;

-- ------------------------------------------------------------
-- RPC: enviar comanda a cocina
-- ------------------------------------------------------------

create or replace function public.send_order(_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid   uuid := auth.uid();
  _order public.orders%rowtype;
  _count int;
begin
  if _uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into _order from public.orders where id = _order_id;
  if not found then
    raise exception 'order_not_found';
  end if;

  if not public.is_member(_order.org_id) then
    raise exception 'not_member';
  end if;

  if not public.has_role(_order.org_id, array['admin', 'encargado', 'mozo', 'caja']::public.user_role[]) then
    raise exception 'forbidden';
  end if;

  perform public.assert_can_operate(_order.org_id);

  if _order.status <> 'draft' then
    raise exception 'order_already_sent';
  end if;

  select count(*) into _count
    from public.order_items
   where order_id = _order_id and status <> 'cancelled';

  if _count = 0 then
    raise exception 'empty_order';
  end if;

  update public.orders
     set status = 'sent', sent_at = now()
   where id = _order_id;
end;
$$;

-- ------------------------------------------------------------
-- RPC: cancelar comanda
-- ------------------------------------------------------------

create or replace function public.cancel_order(
  _order_id uuid,
  _reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid   uuid := auth.uid();
  _order public.orders%rowtype;
begin
  if _uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into _order from public.orders where id = _order_id;
  if not found then
    raise exception 'order_not_found';
  end if;

  if not public.is_member(_order.org_id) then
    raise exception 'not_member';
  end if;

  if not public.has_role(_order.org_id, array['admin', 'encargado', 'mozo', 'caja']::public.user_role[]) then
    raise exception 'forbidden';
  end if;

  if _order.status in ('paid', 'cancelled') then
    raise exception 'order_not_cancellable';
  end if;

  update public.orders
     set status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = _uid,
         cancel_reason = nullif(btrim(coalesce(_reason, '')), '')
   where id = _order_id;

  update public.order_items
     set status = 'cancelled'
   where order_id = _order_id and status <> 'served';
end;
$$;

-- ------------------------------------------------------------
-- RPC: avanzar un ítem en cocina / piso
-- ------------------------------------------------------------

create or replace function public.advance_order_item(
  _item_id uuid,
  _status public.order_item_status
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid   uuid := auth.uid();
  _item  public.order_items%rowtype;
  _order public.orders%rowtype;
  _total int := 0;
  _cancelled int := 0;
  _served int := 0;
  _ready  int := 0;
  _cooking int := 0;
  _pending int := 0;
begin
  if _uid is null then
    raise exception 'not_authenticated';
  end if;

  if _status not in ('pending', 'preparing', 'ready', 'served', 'cancelled') then
    raise exception 'invalid_status';
  end if;

  select i.* into _item from public.order_items i where i.id = _item_id;
  if not found then
    raise exception 'item_not_found';
  end if;

  select * into _order from public.orders where id = _item.order_id;
  if not found or not public.is_member(_order.org_id) then
    raise exception 'not_member';
  end if;

  if not public.has_role(
       _order.org_id,
       array['admin', 'encargado', 'mozo', 'cocina', 'caja']::public.user_role[]
     ) then
    raise exception 'forbidden';
  end if;

  perform public.assert_can_operate(_order.org_id);

  if _order.status in ('draft', 'cancelled', 'paid') then
    raise exception 'order_not_active';
  end if;

  update public.order_items set status = _status where id = _item_id;

  select
    count(*) as total,
    count(*) filter (where status = 'cancelled') as cancelled,
    count(*) filter (where status = 'served')    as served,
    count(*) filter (where status in ('ready', 'served')) as ready,
    count(*) filter (where status in ('preparing', 'ready', 'served')) as cooking,
    count(*) filter (where status = 'pending')   as pending
  into _total, _cancelled, _served, _ready, _cooking, _pending
  from public.order_items
  where order_id = _item.order_id;

  if _total - _cancelled = 0 then
    return;
  end if;

  if _served = _total - _cancelled then
    update public.orders
       set status = 'delivered',
           delivered_at = coalesce(delivered_at, now())
     where id = _order.id;
  elsif _ready = _total - _cancelled then
    update public.orders
       set status = 'ready',
           ready_at = coalesce(ready_at, now())
     where id = _order.id;
  elsif _cooking > 0 then
    update public.orders set status = 'preparing' where id = _order.id;
  elsif _pending > 0 and _order.status in ('sent', 'received') then
    update public.orders set status = 'sent' where id = _order.id;
  end if;
end;
$$;

-- ------------------------------------------------------------
-- Grants
-- ------------------------------------------------------------

revoke all on function public.create_order(uuid, jsonb, text) from public, anon;
revoke all on function public.add_order_items(uuid, jsonb) from public, anon;
revoke all on function public.remove_order_item(uuid) from public, anon;
revoke all on function public.send_order(uuid) from public, anon;
revoke all on function public.cancel_order(uuid, text) from public, anon;
revoke all on function public.advance_order_item(uuid, public.order_item_status) from public, anon;

grant execute on function public.create_order(uuid, jsonb, text) to authenticated;
grant execute on function public.add_order_items(uuid, jsonb) to authenticated;
grant execute on function public.remove_order_item(uuid) to authenticated;
grant execute on function public.send_order(uuid) to authenticated;
grant execute on function public.cancel_order(uuid, text) to authenticated;
grant execute on function public.advance_order_item(uuid, public.order_item_status) to authenticated;
