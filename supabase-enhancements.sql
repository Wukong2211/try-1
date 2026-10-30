-- Borrowed UX update: returned items are archived from discovery but retained
-- in the database so completed transactions, reviews, and credit ledger rows
-- keep their item reference. Run in Supabase SQL Editor after the base schema.

alter table public.items add column if not exists available_from date;
alter table public.items add column if not exists available_until date;
alter table public.borrow_requests add column if not exists extension_status text not null default 'none'
  check (extension_status in ('none','pending'));
alter table public.borrow_requests add column if not exists extension_days integer not null default 0
  check (extension_days between 0 and 7);

create or replace function public.request_borrow_extension(p_request_id uuid, p_extra_days integer)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.borrow_requests%rowtype;
begin
  if not public.is_srmist_member() then raise exception 'SRM campus account required'; end if;
  if p_extra_days not between 1 and 7 then raise exception 'Ask for 1 to 7 extra days'; end if;
  select * into r from public.borrow_requests where id=p_request_id for update;
  if not found or r.status<>'approved' or r.borrower_id<>auth.uid() then
    raise exception 'Only the borrower can request extra time for an active loan';
  end if;
  if r.days+p_extra_days>14 then raise exception 'A borrow can last up to 14 days total'; end if;
  if r.extension_status='pending' then raise exception 'An extension request is already waiting for the owner'; end if;
  update public.borrow_requests set extension_status='pending',extension_days=p_extra_days where id=r.id;
end;
$$;

create or replace function public.respond_borrow_extension(p_request_id uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.borrow_requests%rowtype; i public.items%rowtype; balance integer; extra_cost integer;
begin
  if not public.is_srmist_member() then raise exception 'SRM campus account required'; end if;
  select * into r from public.borrow_requests where id=p_request_id for update;
  if not found or r.status<>'approved' or r.extension_status<>'pending' then raise exception 'No pending extension request'; end if;
  select * into i from public.items where id=r.item_id for update;
  if i.owner_id<>auth.uid() then raise exception 'Only the lender can respond to this extension'; end if;
  if not p_approve then
    update public.borrow_requests set extension_status='none',extension_days=0 where id=r.id;
    return;
  end if;
  extra_cost:=i.credit_cost*r.extension_days;
  select credits into balance from public.profiles where id=r.borrower_id for update;
  if balance<extra_cost then raise exception 'Borrower does not have enough credits for this extension'; end if;
  update public.profiles set credits=credits-extra_cost where id=r.borrower_id;
  update public.borrow_requests set days=days+extension_days,due_at=due_at+make_interval(days=>extension_days),extension_status='none' where id=r.id;
  insert into public.credit_ledger(user_id,request_id,delta,reason) values (r.borrower_id,r.id,-extra_cost,'Extended borrow of '||i.name);
end;
$$;

grant execute on function public.request_borrow_extension(uuid,integer) to authenticated;
grant execute on function public.respond_borrow_extension(uuid,boolean) to authenticated;

create or replace function public.confirm_borrow_return(p_request_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  r public.borrow_requests%rowtype;
  i public.items%rowtype;
  owner_uuid uuid;
  cost integer;
begin
  if not public.is_srmist_member() then raise exception 'SRM campus account required'; end if;
  select * into r from public.borrow_requests where id=p_request_id for update;
  if not found or r.status <> 'approved' then raise exception 'Request is not active'; end if;
  if r.extension_status='pending' then raise exception 'Resolve the pending extension before confirming the return'; end if;
  select * into i from public.items where id=r.item_id for update;
  owner_uuid := i.owner_id;
  if auth.uid() = r.borrower_id then
    update public.borrow_requests set borrower_returned=true where id=r.id;
  elsif auth.uid() = owner_uuid then
    update public.borrow_requests set owner_returned=true where id=r.id;
  else
    raise exception 'Only the borrower or owner can confirm';
  end if;
  select * into r from public.borrow_requests where id=r.id;
  if r.borrower_returned and r.owner_returned then
    update public.borrow_requests set status='completed' where id=r.id;
    -- Archive the listing from discovery after return. Do not hard-delete it:
    -- transaction history and review foreign keys still need the item row.
    update public.items set is_available=false where id=r.item_id;
    cost := i.credit_cost * r.days;
    update public.profiles set credits=credits+cost where id=owner_uuid;
    insert into public.credit_ledger(user_id, request_id, delta, reason)
      values (owner_uuid, r.id, cost, 'Completed lend ' || i.name);
    update public.profiles set reliability_score=least(100,reliability_score+1)
      where id in (r.borrower_id,owner_uuid);
    return 'completed';
  end if;
  return 'waiting_for_other_confirmation';
end;
$$;

grant execute on function public.confirm_borrow_return(uuid) to authenticated;
