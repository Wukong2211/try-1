-- Run this once in Supabase SQL Editor to enable removing old activity entries.
alter table public.borrow_requests
  add column if not exists hidden_by_borrower boolean not null default false,
  add column if not exists hidden_by_owner boolean not null default false;

create or replace function public.hide_borrow_request(p_request_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  request_row public.borrow_requests%rowtype;
  item_owner uuid;
begin
  select * into request_row
  from public.borrow_requests
  where id = p_request_id
  for update;

  if not found or request_row.status not in ('completed', 'declined') then
    raise exception 'Only completed or declined activity can be removed';
  end if;

  select owner_id into item_owner
  from public.items
  where id = request_row.item_id;

  if request_row.borrower_id = auth.uid() then
    update public.borrow_requests set hidden_by_borrower = true where id = request_row.id;
  elsif item_owner = auth.uid() then
    update public.borrow_requests set hidden_by_owner = true where id = request_row.id;
  else
    raise exception 'You are not part of this transaction';
  end if;
end;
$$;

grant execute on function public.hide_borrow_request(uuid) to authenticated;
