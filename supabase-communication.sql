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
