-- Phase 5: Roni's Continuing Story.
--
-- Roni may catalogue her own uploads, but only files inside her own folder
-- (archive/continuing/<her user id>/). Without the path check, a row naming any other
-- archive object would satisfy the "viewers read published" storage policy for her and
-- let her sign unpublished originals.

drop policy if exists "media_assets: owner insert" on public.media_assets;
drop policy if exists "media_assets: owner update" on public.media_assets;

create policy "media_assets: owner insert" on public.media_assets
  for insert to authenticated
  with check (
    bucket = 'archive'
    and collection_id is not null
    and storage_path like 'continuing/' || (select auth.uid())::text || '/%'
    and (select private.owns_writable_collection(collection_id))
  );

create policy "media_assets: owner update" on public.media_assets
  for update to authenticated
  using (
    collection_id is not null
    and (select private.owns_writable_collection(collection_id))
  )
  with check (
    bucket = 'archive'
    and collection_id is not null
    and storage_path like 'continuing/' || (select auth.uid())::text || '/%'
    and (select private.owns_writable_collection(collection_id))
  );
