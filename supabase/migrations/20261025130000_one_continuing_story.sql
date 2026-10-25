-- Roni has exactly one Continuing Story. Concurrent first visits (two tabs, or a
-- remounted page) could each insert one, so uniqueness is enforced here.

delete from public.archive_collections c
 where c.kind = 'continuing_story'
   and exists (
     select 1 from public.archive_collections older
      where older.kind = 'continuing_story'
        and older.owner_id = c.owner_id
        and (older.created_at, older.id) < (c.created_at, c.id)
   )
   and not exists (select 1 from public.memories m where m.collection_id = c.id)
   and not exists (select 1 from public.timeline_milestones t where t.collection_id = c.id)
   and not exists (select 1 from public.media_assets a where a.collection_id = c.id);

create unique index archive_collections_one_continuing_story
  on public.archive_collections (owner_id)
  where kind = 'continuing_story';

create or replace function public.ensure_my_collection()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if not private.has_role('roni') then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  if not private.experience_is_live() then
    raise exception 'The archive opens on the birthday' using errcode = '42501';
  end if;
  insert into public.archive_collections (kind, title, description, owner_id)
  values ('continuing_story', 'The Continuing Story', 'Everything that happens next.', (select auth.uid()))
  on conflict (owner_id) where kind = 'continuing_story' do nothing;
  select id into v_id from public.archive_collections
   where kind = 'continuing_story' and owner_id = (select auth.uid());
  return v_id;
end;
$$;
