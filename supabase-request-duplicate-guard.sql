-- Run this once in Supabase SQL Editor to update the live project.
-- Item-row locking makes the duplicate check safe when requests arrive together.
create or replace function public.create_borrow_request(p_item_id uuid, p_days integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  new_id uuid;
  item_row public.items%rowtype;
begin
  if not public.is_srmist_member() then
    raise exception 'Use an SRM email address ending in @srmist.edu.in';
  end if;
  if p_days not between 1 and 14 then
    raise exception 'Days must be between 1 and 14';
  end if;

  select * into item_row
  from public.items
  where id = p_item_id
  for update;

  if not found or not item_row.is_available or item_row.owner_id = auth.uid() then
    raise exception 'Item is unavailable';
  end if;

  if exists (
    select 1
    from public.borrow_requests r
    where r.item_id = p_item_id
      and r.borrower_id = auth.uid()
      and r.status in ('pending', 'approved')
  ) then
    raise exception 'You already have a pending or active request for this item';
  end if;

  insert into public.borrow_requests(item_id, borrower_id, days)
  values (p_item_id, auth.uid(), p_days)
  returning id into new_id;

  return new_id;
end;
$$;

grant execute on function public.create_borrow_request(uuid, integer) to authenticated;
