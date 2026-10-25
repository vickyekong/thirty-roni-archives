-- Private media buckets. Nothing is public; all reads use short-lived signed URLs.
-- Contributor uploads use signed upload URLs issued by the `contribute` edge function,
-- so no insert policy exists for anonymous users.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'contributions', 'contributions', false, 52428800,
    array[
      'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
      'video/mp4', 'video/quicktime', 'video/webm',
      'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/webm', 'audio/ogg', 'audio/wav', 'audio/x-wav'
    ]
  ),
  (
    'archive', 'archive', false, 52428800,
    array[
      'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
      'video/mp4', 'video/quicktime', 'video/webm',
      'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/webm', 'audio/ogg', 'audio/wav', 'audio/x-wav'
    ]
  )
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Admins manage everything in both buckets.
create policy "media: admin read" on storage.objects
  for select to authenticated
  using (bucket_id in ('contributions', 'archive') and (select private.is_admin()));
create policy "media: admin insert" on storage.objects
  for insert to authenticated
  with check (bucket_id in ('contributions', 'archive') and (select private.is_admin()));
create policy "media: admin update" on storage.objects
  for update to authenticated
  using (bucket_id in ('contributions', 'archive') and (select private.is_admin()))
  with check (bucket_id in ('contributions', 'archive') and (select private.is_admin()));
create policy "media: admin delete" on storage.objects
  for delete to authenticated
  using (bucket_id in ('contributions', 'archive') and (select private.is_admin()));

-- Viewers can sign URLs only for media that is verified, published and visible to them
-- (the media_assets RLS policy decides visibility).
create policy "media: viewers read published" on storage.objects
  for select to authenticated
  using (
    bucket_id in ('contributions', 'archive')
    and (select private.can_view_experience())
    and exists (
      select 1 from public.media_assets m
      where m.bucket = storage.objects.bucket_id
        and m.storage_path = storage.objects.name
    )
  );

-- Roni manages files in her own continuing-story folder: archive/continuing/<user id>/...
create policy "media: roni read own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'archive'
    and (storage.foldername(name))[1] = 'continuing'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and (select private.has_role('roni'))
  );
create policy "media: roni insert own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'archive'
    and (storage.foldername(name))[1] = 'continuing'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and (select private.has_role('roni'))
    and (select private.experience_is_live())
  );
create policy "media: roni update own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'archive'
    and (storage.foldername(name))[1] = 'continuing'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and (select private.has_role('roni'))
  )
  with check (
    bucket_id = 'archive'
    and (storage.foldername(name))[1] = 'continuing'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and (select private.has_role('roni'))
  );
create policy "media: roni delete own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'archive'
    and (storage.foldername(name))[1] = 'continuing'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and (select private.has_role('roni'))
  );
