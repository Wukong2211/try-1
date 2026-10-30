-- Campus skill exchange and teammate board. Run after supabase-schema.sql and
-- its upgrade/communication scripts. No service-role key is used by the app.

create table if not exists public.skill_offers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 90),
  category text not null default 'Study',
  details text not null default '' check (char_length(details)<=700),
  format text not null default 'Either' check (format in ('In person','Online','Either')),
  availability text not null default '',
  credit_cost integer not null default 1 check (credit_cost between 1 and 5),
  status text not null default 'open' check (status in ('open','paused','closed')),
  created_at timestamptz not null default now()
);
create index if not exists skill_offers_open_idx on public.skill_offers(status,created_at desc);

create table if not exists public.skill_sessions (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.skill_offers(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  note text not null default '' check (char_length(note)<=500),
  status text not null default 'pending' check (status in ('pending','approved','declined','completed','cancelled')),
  requester_confirmed boolean not null default false,
  provider_confirmed boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists skill_sessions_requester_idx on public.skill_sessions(requester_id,created_at desc);
create unique index if not exists skill_sessions_one_active_request_idx on public.skill_sessions(offer_id,requester_id) where status in ('pending','approved');

create table if not exists public.skill_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.skill_sessions(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists skill_messages_session_idx on public.skill_messages(session_id,created_at);

create table if not exists public.team_posts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  event_name text not null check (char_length(event_name) between 2 and 100),
  title text not null check (char_length(title) between 3 and 100),
  description text not null default '' check (char_length(description)<=800),
  skills text[] not null default '{}',
  format text not null default 'Either' check (format in ('In person','Online','Either')),
  status text not null default 'open' check (status in ('open','closed')),
  created_at timestamptz not null default now()
);
create index if not exists team_posts_open_idx on public.team_posts(status,created_at desc);

create table if not exists public.team_interests (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.team_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  introduction text not null check (char_length(introduction) between 5 and 500),
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  unique(post_id,user_id)
);

create table if not exists public.team_messages (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.team_posts(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists team_messages_post_idx on public.team_messages(post_id,created_at);

alter table public.skill_offers enable row level security;
alter table public.skill_sessions enable row level security;
alter table public.skill_messages enable row level security;
alter table public.team_posts enable row level security;
alter table public.team_interests enable row level security;
alter table public.team_messages enable row level security;

revoke all on public.skill_offers,public.skill_sessions,public.skill_messages,public.team_posts,public.team_interests,public.team_messages from anon;
revoke insert,update,delete on public.skill_sessions,public.skill_messages,public.team_interests,public.team_messages from authenticated;
grant select,insert,update,delete on public.skill_offers,public.team_posts to authenticated;
grant select on public.skill_sessions,public.skill_messages,public.team_interests,public.team_messages to authenticated;
grant insert on public.team_interests,public.skill_messages,public.team_messages to authenticated;

drop policy if exists "campus read skill offers" on public.skill_offers;
create policy "campus read skill offers" on public.skill_offers for select to authenticated
  using (public.is_srmist_member() and (status='open' or owner_id=auth.uid()));
drop policy if exists "students create skill offers" on public.skill_offers;
create policy "students create skill offers" on public.skill_offers for insert to authenticated
  with check (public.is_srmist_member() and owner_id=auth.uid());
drop policy if exists "owners manage skill offers" on public.skill_offers;
create policy "owners manage skill offers" on public.skill_offers for update to authenticated
  using (public.is_srmist_member() and owner_id=auth.uid()) with check (public.is_srmist_member() and owner_id=auth.uid());
drop policy if exists "owners remove skill offers" on public.skill_offers;
create policy "owners remove skill offers" on public.skill_offers for delete to authenticated
  using (public.is_srmist_member() and owner_id=auth.uid());

drop policy if exists "participants read skill sessions" on public.skill_sessions;
create policy "participants read skill sessions" on public.skill_sessions for select to authenticated
  using (public.is_srmist_member() and (requester_id=auth.uid() or exists(select 1 from public.skill_offers o where o.id=offer_id and o.owner_id=auth.uid())));
drop policy if exists "active skill participants read messages" on public.skill_messages;
create policy "active skill participants read messages" on public.skill_messages for select to authenticated
  using (public.is_srmist_member() and exists(select 1 from public.skill_sessions s join public.skill_offers o on o.id=s.offer_id where s.id=session_id and s.status='approved' and (s.requester_id=auth.uid() or o.owner_id=auth.uid())));
drop policy if exists "active skill participants send messages" on public.skill_messages;
create policy "active skill participants send messages" on public.skill_messages for insert to authenticated
  with check (public.is_srmist_member() and sender_id=auth.uid() and exists(select 1 from public.skill_sessions s join public.skill_offers o on o.id=s.offer_id where s.id=session_id and s.status='approved' and (s.requester_id=auth.uid() or o.owner_id=auth.uid())));

drop policy if exists "campus read open team posts" on public.team_posts;
create policy "campus read open team posts" on public.team_posts for select to authenticated
  using (public.is_srmist_member() and (status='open' or owner_id=auth.uid()));
drop policy if exists "students create team posts" on public.team_posts;
create policy "students create team posts" on public.team_posts for insert to authenticated
  with check (public.is_srmist_member() and owner_id=auth.uid());
drop policy if exists "owners manage team posts" on public.team_posts;
create policy "owners manage team posts" on public.team_posts for update to authenticated
  using (public.is_srmist_member() and owner_id=auth.uid()) with check (public.is_srmist_member() and owner_id=auth.uid());
drop policy if exists "owners remove team posts" on public.team_posts;
create policy "owners remove team posts" on public.team_posts for delete to authenticated
  using (public.is_srmist_member() and owner_id=auth.uid());

drop policy if exists "participants read team interests" on public.team_interests;
create policy "participants read team interests" on public.team_interests for select to authenticated
  using (public.is_srmist_member() and (user_id=auth.uid() or exists(select 1 from public.team_posts p where p.id=post_id and p.owner_id=auth.uid())));
drop policy if exists "students express team interest" on public.team_interests;
create policy "students express team interest" on public.team_interests for insert to authenticated
  with check (public.is_srmist_member() and user_id=auth.uid() and exists(select 1 from public.team_posts p where p.id=post_id and p.status='open' and p.owner_id<>auth.uid()));

drop policy if exists "accepted team members read messages" on public.team_messages;
create policy "accepted team members read messages" on public.team_messages for select to authenticated
  using (public.is_srmist_member() and (exists(select 1 from public.team_posts p where p.id=post_id and p.owner_id=auth.uid()) or exists(select 1 from public.team_interests ti where ti.post_id=team_messages.post_id and ti.user_id=auth.uid() and ti.status='accepted')));
drop policy if exists "accepted team members send messages" on public.team_messages;
create policy "accepted team members send messages" on public.team_messages for insert to authenticated
  with check (public.is_srmist_member() and sender_id=auth.uid() and (exists(select 1 from public.team_posts p where p.id=post_id and p.owner_id=auth.uid()) or exists(select 1 from public.team_interests ti where ti.post_id=team_messages.post_id and ti.user_id=auth.uid() and ti.status='accepted')));

create or replace function public.create_skill_session(p_offer_id uuid,p_note text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare offer_row public.skill_offers%rowtype; new_id uuid;
begin
  if not public.is_srmist_member() then raise exception 'SRM campus account required'; end if;
  select * into offer_row from public.skill_offers where id=p_offer_id and status='open';
  if not found or offer_row.owner_id=auth.uid() then raise exception 'This skill offer is unavailable'; end if;
  if exists(select 1 from public.skill_sessions s where s.offer_id=p_offer_id and s.requester_id=auth.uid() and s.status in ('pending','approved')) then
    raise exception 'You already have an active request for this skill';
  end if;
  insert into public.skill_sessions(offer_id,requester_id,note) values(p_offer_id,auth.uid(),left(btrim(coalesce(p_note,'')),500)) returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.respond_skill_session(p_session_id uuid,p_accept boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.skill_sessions%rowtype; o public.skill_offers%rowtype; funds integer;
begin
  if not public.is_srmist_member() then raise exception 'SRM campus account required'; end if;
  select * into s from public.skill_sessions where id=p_session_id for update;
  if not found or s.status<>'pending' then raise exception 'Skill request is no longer pending'; end if;
  select * into o from public.skill_offers where id=s.offer_id for update;
  if o.owner_id<>auth.uid() then raise exception 'Only the skill provider can respond'; end if;
  if not p_accept then update public.skill_sessions set status='declined' where id=s.id; return; end if;
  select credits into funds from public.profiles where id=s.requester_id for update;
  if funds<o.credit_cost then raise exception 'Student does not have enough credits'; end if;
  update public.profiles set credits=credits-o.credit_cost where id=s.requester_id;
  insert into public.credit_ledger(user_id,delta,reason) values(s.requester_id,-o.credit_cost,'Booked a campus skill session: '||o.title);
  update public.skill_sessions set status='approved' where id=s.id;
end;
$$;

create or replace function public.confirm_skill_session(p_session_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare s public.skill_sessions%rowtype; o public.skill_offers%rowtype;
begin
  if not public.is_srmist_member() then raise exception 'SRM campus account required'; end if;
  select * into s from public.skill_sessions where id=p_session_id for update;
  if not found or s.status<>'approved' then raise exception 'Skill session is not active'; end if;
  select * into o from public.skill_offers where id=s.offer_id for update;
  if auth.uid()=s.requester_id then update public.skill_sessions set requester_confirmed=true where id=s.id;
  elsif auth.uid()=o.owner_id then update public.skill_sessions set provider_confirmed=true where id=s.id;
  else raise exception 'Only session participants can confirm'; end if;
  select * into s from public.skill_sessions where id=s.id;
  if s.requester_confirmed and s.provider_confirmed then
    update public.skill_sessions set status='completed' where id=s.id;
    update public.profiles set credits=credits+o.credit_cost,reliability_score=least(100,reliability_score+1) where id=o.owner_id;
    update public.profiles set reliability_score=least(100,reliability_score+1) where id=s.requester_id;
    insert into public.credit_ledger(user_id,delta,reason) values(o.owner_id,o.credit_cost,'Completed campus skill session: '||o.title);
    return 'completed';
  end if;
  return 'waiting_for_other_confirmation';
end;
$$;

create or replace function public.cancel_skill_session(p_session_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.skill_sessions%rowtype; o public.skill_offers%rowtype;
begin
  if not public.is_srmist_member() then raise exception 'SRM campus account required'; end if;
  select * into s from public.skill_sessions where id=p_session_id for update;
  if not found or s.status not in ('pending','approved') then raise exception 'This session can no longer be cancelled'; end if;
  select * into o from public.skill_offers where id=s.offer_id for update;
  if auth.uid() not in (s.requester_id,o.owner_id) then raise exception 'Only session participants can cancel'; end if;
  if s.status='approved' then
    if s.requester_confirmed or s.provider_confirmed then raise exception 'A confirmed session must be resolved with the other student'; end if;
    update public.profiles set credits=credits+o.credit_cost where id=s.requester_id;
    insert into public.credit_ledger(user_id,delta,reason) values(s.requester_id,o.credit_cost,'Refunded cancelled campus skill session: '||o.title);
  end if;
  update public.skill_sessions set status='cancelled' where id=s.id;
end;
$$;

create or replace function public.respond_team_interest(p_interest_id uuid,p_accept boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare ti public.team_interests%rowtype; owner_uuid uuid;
begin
  if not public.is_srmist_member() then raise exception 'SRM campus account required'; end if;
  select * into ti from public.team_interests where id=p_interest_id for update;
  if not found or ti.status<>'pending' then raise exception 'This teammate request is no longer pending'; end if;
  select owner_id into owner_uuid from public.team_posts where id=ti.post_id and status='open';
  if owner_uuid is null or owner_uuid<>auth.uid() then raise exception 'Only the team organizer can respond'; end if;
  update public.team_interests set status=case when p_accept then 'accepted' else 'declined' end where id=ti.id;
end;
$$;

grant execute on function public.create_skill_session(uuid,text) to authenticated;
grant execute on function public.respond_skill_session(uuid,boolean) to authenticated;
grant execute on function public.confirm_skill_session(uuid) to authenticated;
grant execute on function public.cancel_skill_session(uuid) to authenticated;
grant execute on function public.respond_team_interest(uuid,boolean) to authenticated;
