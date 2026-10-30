-- Run this if you already ran an earlier copy of supabase-schema.sql.
alter table public.borrow_requests
  add column if not exists hidden_by_borrower boolean not null default false,
  add column if not exists hidden_by_owner boolean not null default false;

create or replace function public.can_view_borrowed_item(p_item_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.borrow_requests r
    where r.item_id = p_item_id and r.borrower_id = auth.uid()
      and r.status in ('approved','completed','disputed')
  );
$$;
grant execute on function public.can_view_borrowed_item(uuid) to authenticated;
drop policy if exists "campus members view available items" on public.items;
create policy "campus members view available items" on public.items for select to authenticated
using (is_available or owner_id = auth.uid() or public.can_view_borrowed_item(id));

-- Requests must be created through create_borrow_request(), which checks that
-- the item is available and is not owned by the borrower.
drop policy if exists "borrowers create requests" on public.borrow_requests;
revoke insert, update, delete on public.borrow_requests from authenticated;

-- Keep the borrower's credits reserved at approval, but award the lender only
-- after both sides confirm the return.
create or replace function public.approve_borrow_request(p_request_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r public.borrow_requests%rowtype;
  i public.items%rowtype;
  cost integer;
  borrower_balance integer;
begin
  select * into r from public.borrow_requests where id = p_request_id for update;
  if not found then raise exception 'Request not found'; end if;
  select * into i from public.items where id = r.item_id for update;
  if i.owner_id <> auth.uid() then raise exception 'Only the item owner can approve'; end if;
  if r.status <> 'pending' or not i.is_available then raise exception 'Request is no longer pending'; end if;
  cost := i.credit_cost * r.days;
  select credits into borrower_balance from public.profiles where id = r.borrower_id for update;
  if borrower_balance < cost then raise exception 'Borrower does not have enough credits'; end if;
  update public.profiles set credits = credits - cost where id = r.borrower_id;
  update public.borrow_requests set status = 'approved', due_at = now() + make_interval(days => r.days) where id = r.id;
  update public.items set is_available = false where id = i.id;
  insert into public.credit_ledger(user_id, request_id, delta, reason)
    values (r.borrower_id, r.id, -cost, 'Borrowed ' || i.name);
end;
$$;

create or replace function public.confirm_borrow_return(p_request_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  r public.borrow_requests%rowtype;
  i public.items%rowtype;
  cost integer;
begin
  select * into r from public.borrow_requests where id = p_request_id for update;
  if not found or r.status <> 'approved' then raise exception 'Request is not active'; end if;
  select * into i from public.items where id = r.item_id;
  if auth.uid() = r.borrower_id then
    update public.borrow_requests set borrower_returned = true where id = r.id;
  elsif auth.uid() = i.owner_id then
    update public.borrow_requests set owner_returned = true where id = r.id;
  else raise exception 'Only the borrower or owner can confirm';
  end if;
  select * into r from public.borrow_requests where id = r.id;
  if r.borrower_returned and r.owner_returned then
    update public.borrow_requests set status = 'completed' where id = r.id;
    update public.items set is_available = true where id = r.item_id;
    cost := i.credit_cost * r.days;
    update public.profiles set credits = credits + cost where id = i.owner_id;
    insert into public.credit_ledger(user_id, request_id, delta, reason)
      values (i.owner_id, r.id, cost, 'Completed lend ' || i.name);
    update public.profiles set reliability_score = least(100, reliability_score + 1) where id in (r.borrower_id, i.owner_id);
    return 'completed';
  end if;
  return 'waiting_for_other_confirmation';
end;
$$;
grant execute on function public.approve_borrow_request(uuid) to authenticated;
grant execute on function public.confirm_borrow_return(uuid) to authenticated;

-- Restrict sign-ups and all authenticated data access to SRMIST email accounts.
create or replace function public.is_srmist_member()
returns boolean language sql stable set search_path = '' as $$
  select coalesce(lower(split_part(auth.jwt() ->> 'email', '@', 2)) = 'srmist.edu.in', false);
$$;
grant execute on function public.is_srmist_member() to authenticated;

create or replace function public.create_borrowed_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.email is null or lower(split_part(new.email, '@', 2)) <> 'srmist.edu.in' then
    raise exception 'Use an SRM email address ending in @srmist.edu.in';
  end if;
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', 'Campus member'))
  on conflict (id) do nothing;
  return new;
end;
$$;

alter table public.items add column if not exists pickup_lat double precision;
alter table public.items add column if not exists pickup_lng double precision;
update public.items set pickup_lat=12.8248, pickup_lng=80.0494,
  pickup_zone=coalesce(nullif(pickup_zone,''),'SRM KTR campus (approximate)')
where pickup_lat is null or pickup_lng is null;

drop policy if exists "campus members can view profiles" on public.profiles;
create policy "campus members can view profiles" on public.profiles for select to authenticated using (public.is_srmist_member());
drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile" on public.profiles for update to authenticated using (public.is_srmist_member() and id=auth.uid()) with check (public.is_srmist_member() and id=auth.uid());

drop policy if exists "campus members view available items" on public.items;
create policy "campus members view available items" on public.items for select to authenticated using (public.is_srmist_member() and (is_available or owner_id=auth.uid() or public.can_view_borrowed_item(id)));
drop policy if exists "owners add items" on public.items;
create policy "owners add items" on public.items for insert to authenticated with check (public.is_srmist_member() and owner_id=auth.uid());
drop policy if exists "owners edit items" on public.items;
create policy "owners edit items" on public.items for update to authenticated using (public.is_srmist_member() and owner_id=auth.uid()) with check (public.is_srmist_member() and owner_id=auth.uid());
drop policy if exists "owners delete items" on public.items;
create policy "owners delete items" on public.items for delete to authenticated using (public.is_srmist_member() and owner_id=auth.uid());

drop policy if exists "participants view borrow requests" on public.borrow_requests;
create policy "participants view borrow requests" on public.borrow_requests for select to authenticated using (public.is_srmist_member() and (borrower_id=auth.uid() or exists (select 1 from public.items i where i.id=item_id and i.owner_id=auth.uid())));
drop policy if exists "users view own ledger" on public.credit_ledger;
create policy "users view own ledger" on public.credit_ledger for select to authenticated using (public.is_srmist_member() and user_id=auth.uid());

drop policy if exists "campus sees open wishlists" on public.wishlist_requests;
create policy "campus sees open wishlists" on public.wishlist_requests for select to authenticated using (public.is_srmist_member() and (status='open' or user_id=auth.uid()));
drop policy if exists "users create wishlists" on public.wishlist_requests;
create policy "users create wishlists" on public.wishlist_requests for insert to authenticated with check (public.is_srmist_member() and user_id=auth.uid());
drop policy if exists "users close own wishlists" on public.wishlist_requests;
create policy "users close own wishlists" on public.wishlist_requests for update to authenticated using (public.is_srmist_member() and user_id=auth.uid()) with check (public.is_srmist_member() and user_id=auth.uid());
drop policy if exists "campus members read reviews" on public.reviews;
create policy "campus members read reviews" on public.reviews for select to authenticated using (public.is_srmist_member());
drop policy if exists "participants review completed trades" on public.reviews;
create policy "participants review completed trades" on public.reviews for insert to authenticated with check (
  public.is_srmist_member() and reviewer_id=auth.uid() and exists (
    select 1 from public.borrow_requests r join public.items i on i.id=r.item_id
    where r.id=request_id and r.status='completed'
      and ((r.borrower_id=auth.uid() and i.owner_id=reviewee_id) or (i.owner_id=auth.uid() and r.borrower_id=reviewee_id))
  )
);

-- The RPCs are SECURITY DEFINER, so repeat the campus-domain check inside them.
create or replace function public.create_borrow_request(p_item_id uuid, p_days integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_id uuid; item_row public.items%rowtype;
begin
  if not public.is_srmist_member() then raise exception 'Use an SRM email address ending in @srmist.edu.in'; end if;
  if p_days not between 1 and 14 then raise exception 'Days must be between 1 and 14'; end if;
  select * into item_row from public.items where id=p_item_id for update;
  if not found or not item_row.is_available or item_row.owner_id=auth.uid() then raise exception 'Item is unavailable'; end if;
  if exists(select 1 from public.borrow_requests r where r.item_id=p_item_id and r.borrower_id=auth.uid() and r.status in ('pending','approved')) then
    raise exception 'You already have a pending or active request for this item';
  end if;
  insert into public.borrow_requests(item_id, borrower_id, days) values (p_item_id, auth.uid(), p_days) returning id into new_id;
  return new_id;
end;
$$;
grant execute on function public.create_borrow_request(uuid, integer) to authenticated;

create or replace function public.hide_borrow_request(p_request_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.borrow_requests%rowtype; item_owner uuid;
begin
  select * into r from public.borrow_requests where id=p_request_id for update;
  if not found or r.status not in ('completed','declined') then
    raise exception 'Only completed or declined activity can be removed';
  end if;
  select owner_id into item_owner from public.items where id=r.item_id;
  if r.borrower_id=auth.uid() then
    update public.borrow_requests set hidden_by_borrower=true where id=r.id;
  elsif item_owner=auth.uid() then
    update public.borrow_requests set hidden_by_owner=true where id=r.id;
  else
    raise exception 'You are not part of this transaction';
  end if;
end;
$$;
grant execute on function public.hide_borrow_request(uuid) to authenticated;

create or replace function public.approve_borrow_request(p_request_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.borrow_requests%rowtype; i public.items%rowtype; cost integer; borrower_balance integer;
begin
  if not public.is_srmist_member() then raise exception 'Use an SRM email address ending in @srmist.edu.in'; end if;
  select * into r from public.borrow_requests where id=p_request_id for update;
  if not found then raise exception 'Request not found'; end if;
  select * into i from public.items where id=r.item_id for update;
  if i.owner_id<>auth.uid() then raise exception 'Only the item owner can approve'; end if;
  if r.status<>'pending' or not i.is_available then raise exception 'Request is no longer pending'; end if;
  cost:=i.credit_cost*r.days;
  select credits into borrower_balance from public.profiles where id=r.borrower_id for update;
  if borrower_balance<cost then raise exception 'Borrower does not have enough credits'; end if;
  update public.profiles set credits=credits-cost where id=r.borrower_id;
  update public.borrow_requests set status='approved',due_at=now()+make_interval(days=>r.days) where id=r.id;
  update public.items set is_available=false where id=i.id;
  insert into public.credit_ledger(user_id,request_id,delta,reason) values (r.borrower_id,r.id,-cost,'Borrowed '||i.name);
end;
$$;

create or replace function public.decline_borrow_request(p_request_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_srmist_member() then raise exception 'Use an SRM email address ending in @srmist.edu.in'; end if;
  update public.borrow_requests r set status='declined' from public.items i
  where r.id=p_request_id and i.id=r.item_id and i.owner_id=auth.uid() and r.status='pending';
  if not found then raise exception 'Request not found or not available to decline'; end if;
end;
$$;

create or replace function public.confirm_borrow_return(p_request_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare r public.borrow_requests%rowtype; i public.items%rowtype; cost integer;
begin
  if not public.is_srmist_member() then raise exception 'Use an SRM email address ending in @srmist.edu.in'; end if;
  select * into r from public.borrow_requests where id=p_request_id for update;
  if not found or r.status<>'approved' then raise exception 'Request is not active'; end if;
  select * into i from public.items where id=r.item_id;
  if auth.uid()=r.borrower_id then update public.borrow_requests set borrower_returned=true where id=r.id;
  elsif auth.uid()=i.owner_id then update public.borrow_requests set owner_returned=true where id=r.id;
  else raise exception 'Only the borrower or owner can confirm'; end if;
  select * into r from public.borrow_requests where id=r.id;
  if r.borrower_returned and r.owner_returned then
    update public.borrow_requests set status='completed' where id=r.id;
    update public.items set is_available=true where id=r.item_id;
    cost:=i.credit_cost*r.days;
    update public.profiles set credits=credits+cost where id=i.owner_id;
    insert into public.credit_ledger(user_id,request_id,delta,reason) values (i.owner_id,r.id,cost,'Completed lend '||i.name);
    update public.profiles set reliability_score=least(100,reliability_score+1) where id in (r.borrower_id,i.owner_id);
    return 'completed';
  end if;
  return 'waiting_for_other_confirmation';
end;
$$;
grant execute on function public.approve_borrow_request(uuid) to authenticated;
grant execute on function public.decline_borrow_request(uuid) to authenticated;
grant execute on function public.confirm_borrow_return(uuid) to authenticated;
-- Run once in Supabase SQL Editor to enable private in-app messaging and
-- optional phone sharing for approved borrow requests.

create table if not exists public.borrow_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.borrow_requests(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists borrow_messages_thread_idx
  on public.borrow_messages (request_id, created_at);

create table if not exists public.borrow_contacts (
  request_id uuid not null references public.borrow_requests(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  phone text not null,
  shared_at timestamptz not null default now(),
  primary key (request_id, user_id)
);

-- Define this helper here too so this migration works on projects that have
-- not yet run the full Borrowed schema upgrade.
create or replace function public.is_srmist_member()
returns boolean language sql stable set search_path = '' as $$
  select coalesce(lower(split_part(auth.jwt() ->> 'email', '@', 2)) = 'srmist.edu.in', false);
$$;
grant execute on function public.is_srmist_member() to authenticated;

alter table public.borrow_messages enable row level security;
alter table public.borrow_contacts enable row level security;
revoke all on public.borrow_messages, public.borrow_contacts from anon, authenticated;
revoke insert, update, delete on public.borrow_requests from authenticated;
revoke delete on public.wishlist_requests from authenticated;
grant select on public.borrow_messages, public.borrow_contacts to authenticated;

drop policy if exists "participants read active borrow messages" on public.borrow_messages;
create policy "participants read active borrow messages" on public.borrow_messages
  for select to authenticated using (
    public.is_srmist_member() and exists (
      select 1 from public.borrow_requests r join public.items i on i.id=r.item_id
      where r.id=request_id and r.status in ('pending','approved')
        and (r.borrower_id=auth.uid() or i.owner_id=auth.uid())
    )
  );

drop policy if exists "participants read shared borrow contacts" on public.borrow_contacts;
create policy "participants read shared borrow contacts" on public.borrow_contacts
  for select to authenticated using (
    public.is_srmist_member() and exists (
      select 1 from public.borrow_requests r join public.items i on i.id=r.item_id
      where r.id=request_id and r.status='approved'
        and (r.borrower_id=auth.uid() or i.owner_id=auth.uid())
    )
  );

create or replace function public.send_borrow_message(p_request_id uuid, p_body text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  borrower uuid;
  item_owner uuid;
  request_status text;
  message_id uuid;
  message_body text := btrim(coalesce(p_body, ''));
begin
  if not public.is_srmist_member() then raise exception 'SRM campus account required'; end if;
  if char_length(message_body) not between 1 and 1000 then raise exception 'Message must be 1 to 1000 characters'; end if;
  select r.borrower_id, i.owner_id, r.status into borrower, item_owner, request_status
    from public.borrow_requests r join public.items i on i.id=r.item_id
    where r.id=p_request_id;
  if not found or request_status not in ('pending','approved') then raise exception 'Messaging is unavailable for this request'; end if;
  if auth.uid() not in (borrower, item_owner) then raise exception 'You are not part of this request'; end if;
  insert into public.borrow_messages(request_id, sender_id, body)
    values (p_request_id, auth.uid(), message_body) returning id into message_id;
  return message_id;
end;
$$;

create or replace function public.share_borrow_contact(p_request_id uuid, p_phone text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  borrower uuid;
  item_owner uuid;
  request_status text;
  clean_phone text := regexp_replace(trim(coalesce(p_phone, '')), '[^0-9+]', '', 'g');
begin
  if not public.is_srmist_member() then raise exception 'SRM campus account required'; end if;
  if clean_phone !~ '^([+]91)?[6-9][0-9]{9}$' then raise exception 'Enter a valid Indian mobile number'; end if;
  select r.borrower_id, i.owner_id, r.status into borrower, item_owner, request_status
    from public.borrow_requests r join public.items i on i.id=r.item_id
    where r.id=p_request_id;
  if not found or request_status <> 'approved' then raise exception 'Phone sharing is available after approval'; end if;
  if auth.uid() not in (borrower, item_owner) then raise exception 'You are not part of this request'; end if;
  insert into public.borrow_contacts(request_id, user_id, phone)
    values (p_request_id, auth.uid(), clean_phone)
    on conflict (request_id, user_id) do update set phone=excluded.phone, shared_at=now();
end;
$$;

create or replace function public.revoke_borrow_contact(p_request_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.borrow_contacts where request_id=p_request_id and user_id=auth.uid();
end;
$$;

create or replace function public.delete_borrow_requests(p_request_ids uuid[])
returns integer language plpgsql security definer set search_path = '' as $$
declare
  requested_count integer;
  deleted_count integer;
begin
  if not public.is_srmist_member() then raise exception 'SRM campus account required'; end if;
  if p_request_ids is null or cardinality(p_request_ids)=0 or cardinality(p_request_ids)>50 then
    raise exception 'Select between 1 and 50 activity records';
  end if;
  select count(distinct request_id) into requested_count
    from unnest(p_request_ids) as selected(request_id);
  if requested_count<>cardinality(p_request_ids) then raise exception 'A record was selected more than once'; end if;
  if exists (
    select 1
    from unnest(p_request_ids) as selected(request_id)
    left join public.borrow_requests r on r.id=selected.request_id
    left join public.items i on i.id=r.item_id
    where r.id is null
      or r.status not in ('completed','declined')
      or (r.borrower_id<>auth.uid() and i.owner_id<>auth.uid())
  ) then raise exception 'Only your completed or declined transactions can be deleted'; end if;
  delete from public.borrow_requests r
    where r.id=any(p_request_ids)
      and r.status in ('completed','declined')
      and (r.borrower_id=auth.uid() or exists (
        select 1 from public.items i where i.id=r.item_id and i.owner_id=auth.uid()
      ));
  get diagnostics deleted_count = row_count;
  if deleted_count<>requested_count then raise exception 'Could not delete every selected record'; end if;
  return deleted_count;
end;
$$;

create or replace function public.delete_wishlist_requests(p_request_ids uuid[])
returns integer language plpgsql security definer set search_path = '' as $$
declare
  requested_count integer;
  deleted_count integer;
begin
  if not public.is_srmist_member() then raise exception 'SRM campus account required'; end if;
  if p_request_ids is null or cardinality(p_request_ids)=0 or cardinality(p_request_ids)>50 then
    raise exception 'Select between 1 and 50 wishlist requests';
  end if;
  select count(distinct request_id) into requested_count
    from unnest(p_request_ids) as selected(request_id);
  if requested_count<>cardinality(p_request_ids) then raise exception 'A request was selected more than once'; end if;
  if exists (
    select 1 from unnest(p_request_ids) as selected(request_id)
    left join public.wishlist_requests w on w.id=selected.request_id
    where w.id is null or w.user_id<>auth.uid()
  ) then raise exception 'You can delete only your own wishlist requests'; end if;
  delete from public.wishlist_requests w where w.id=any(p_request_ids) and w.user_id=auth.uid();
  get diagnostics deleted_count = row_count;
  if deleted_count<>requested_count then raise exception 'Could not delete every selected request'; end if;
  return deleted_count;
end;
$$;

grant execute on function public.send_borrow_message(uuid, text) to authenticated;
grant execute on function public.share_borrow_contact(uuid, text) to authenticated;
grant execute on function public.revoke_borrow_contact(uuid) to authenticated;
grant execute on function public.delete_borrow_requests(uuid[]) to authenticated;
grant execute on function public.delete_wishlist_requests(uuid[]) to authenticated;



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
