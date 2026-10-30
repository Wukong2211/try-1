-- Profile photo storage for Borrowed. Run after supabase-schema.sql and the SRM email verification function.
alter table public.profiles add column if not exists avatar_path text;
grant update (display_name,campus,avatar_path) on public.profiles to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('borrowed-avatars','borrowed-avatars',true,1048576,array['image/jpeg'])
on conflict(id) do update set public=true,file_size_limit=1048576,allowed_mime_types=array['image/jpeg'];

drop policy if exists "SRM students read own avatar objects" on storage.objects;
create policy "SRM students read own avatar objects" on storage.objects for select to authenticated
using(bucket_id='borrowed-avatars' and (storage.foldername(name))[1]=auth.uid()::text and public.is_srmist_member());

drop policy if exists "SRM students upload own avatar objects" on storage.objects;
create policy "SRM students upload own avatar objects" on storage.objects for insert to authenticated
with check(bucket_id='borrowed-avatars' and (storage.foldername(name))[1]=auth.uid()::text and public.is_srmist_member());

drop policy if exists "SRM students delete own avatar objects" on storage.objects;
create policy "SRM students delete own avatar objects" on storage.objects for delete to authenticated
using(bucket_id='borrowed-avatars' and (storage.foldername(name))[1]=auth.uid()::text and public.is_srmist_member());
