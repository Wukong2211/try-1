-- Student marketplace, campus deals, and opportunities.
-- Run after supabase-schema.sql (which defines public.is_srmist_member()).

create table if not exists public.campus_board_posts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  post_type text not null check(post_type in ('item_sale','item_exchange','giveaway','deal','opportunity','missing_id','found_id')),
  title text not null check(char_length(title) between 3 and 100),
  description text not null check(char_length(description) between 5 and 1200),
  category text not null default 'Other' check(char_length(category)<=50),
  price_rupees integer check(price_rupees is null or price_rupees between 1 and 1000000),
  expires_at date,
  status text not null default 'open' check(status in ('open','closed')),
  created_at timestamptz not null default now()
);
alter table public.campus_board_posts drop constraint if exists campus_board_posts_post_type_check;
alter table public.campus_board_posts add constraint campus_board_posts_post_type_check
  check(post_type in ('item_sale','item_exchange','giveaway','deal','opportunity','missing_id','found_id'));
create index if not exists campus_board_posts_open_idx on public.campus_board_posts(status,created_at desc);

create table if not exists public.campus_board_interests (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.campus_board_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  introduction text not null check(char_length(introduction) between 5 and 500),
  status text not null default 'pending' check(status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  unique(post_id,user_id)
);
create index if not exists campus_board_interests_post_idx on public.campus_board_interests(post_id,created_at);

create table if not exists public.campus_board_messages (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.campus_board_posts(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid references public.profiles(id) on delete cascade,
  body text not null check(char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
alter table public.campus_board_messages add column if not exists recipient_id uuid references public.profiles(id) on delete cascade;
create index if not exists campus_board_messages_post_idx on public.campus_board_messages(post_id,created_at);

alter table public.campus_board_posts enable row level security;
alter table public.campus_board_interests enable row level security;
alter table public.campus_board_messages enable row level security;

revoke all on public.campus_board_posts,public.campus_board_interests,public.campus_board_messages from anon;
revoke insert,update,delete on public.campus_board_interests,public.campus_board_messages from authenticated;
grant select,insert,update,delete on public.campus_board_posts to authenticated;
grant select on public.campus_board_interests,public.campus_board_messages to authenticated;
grant insert on public.campus_board_interests,public.campus_board_messages to authenticated;

drop policy if exists "SRM members view open campus board" on public.campus_board_posts;
create policy "SRM members view open campus board" on public.campus_board_posts for select to authenticated
using(public.is_srmist_member() and (status='open' or owner_id=auth.uid()));
drop policy if exists "SRM members create campus board posts" on public.campus_board_posts;
create policy "SRM members create campus board posts" on public.campus_board_posts for insert to authenticated
with check(public.is_srmist_member() and owner_id=auth.uid());
drop policy if exists "Owners update campus board posts" on public.campus_board_posts;
create policy "Owners update campus board posts" on public.campus_board_posts for update to authenticated
using(public.is_srmist_member() and owner_id=auth.uid()) with check(public.is_srmist_member() and owner_id=auth.uid());
drop policy if exists "Owners delete campus board posts" on public.campus_board_posts;
create policy "Owners delete campus board posts" on public.campus_board_posts for delete to authenticated
using(public.is_srmist_member() and owner_id=auth.uid());

drop policy if exists "Campus board participants read interests" on public.campus_board_interests;
create policy "Campus board participants read interests" on public.campus_board_interests for select to authenticated
using(public.is_srmist_member() and (user_id=auth.uid() or exists(select 1 from public.campus_board_posts p where p.id=post_id and p.owner_id=auth.uid())));
drop policy if exists "SRM students express board interest" on public.campus_board_interests;
create policy "SRM students express board interest" on public.campus_board_interests for insert to authenticated
with check(public.is_srmist_member() and user_id=auth.uid() and exists(select 1 from public.campus_board_posts p where p.id=post_id and p.status='open' and (p.expires_at is null or p.expires_at>=current_date) and p.owner_id<>auth.uid()));

drop policy if exists "Accepted campus board participants read messages" on public.campus_board_messages;
create policy "Accepted campus board participants read messages" on public.campus_board_messages for select to authenticated
using(public.is_srmist_member() and recipient_id is not null and ((sender_id=auth.uid() or recipient_id=auth.uid()) and exists(select 1 from public.campus_board_interests i join public.campus_board_posts p on p.id=i.post_id where i.post_id=campus_board_messages.post_id and i.status='accepted' and ((i.user_id=auth.uid() and p.owner_id=case when sender_id=auth.uid() then recipient_id else sender_id end) or (p.owner_id=auth.uid() and i.user_id=case when sender_id=auth.uid() then recipient_id else sender_id end)))));
drop policy if exists "Accepted campus board participants send messages" on public.campus_board_messages;
create policy "Accepted campus board participants send messages" on public.campus_board_messages for insert to authenticated
with check(public.is_srmist_member() and recipient_id is not null and sender_id=auth.uid() and exists(select 1 from public.campus_board_interests i join public.campus_board_posts p on p.id=i.post_id where i.post_id=campus_board_messages.post_id and i.status='accepted' and ((i.user_id=auth.uid() and p.owner_id=recipient_id) or (p.owner_id=auth.uid() and i.user_id=recipient_id))));

create or replace function public.respond_campus_board_interest(p_interest_id uuid,p_accept boolean)
returns void language plpgsql security definer set search_path='' as $$
declare i public.campus_board_interests%rowtype; owner_uuid uuid; expiry_date date;
begin
  if not public.is_srmist_member() then raise exception 'SRM campus account required'; end if;
  select * into i from public.campus_board_interests where id=p_interest_id for update;
  if not found or i.status<>'pending' then raise exception 'This interest request is no longer pending'; end if;
  select owner_id,expires_at into owner_uuid,expiry_date from public.campus_board_posts where id=i.post_id and status='open';
  if owner_uuid is null or owner_uuid<>auth.uid() then raise exception 'Only the post owner can respond'; end if;
  if p_accept and expiry_date is not null and expiry_date<current_date then raise exception 'This post has expired'; end if;
  update public.campus_board_interests set status=case when p_accept then 'accepted' else 'declined' end where id=i.id;
end;
$$;
grant execute on function public.respond_campus_board_interest(uuid,boolean) to authenticated;
