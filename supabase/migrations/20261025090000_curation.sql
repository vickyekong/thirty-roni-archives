-- Phase 3: review workflow, importing approved submissions into the archive,
-- experience access state, freezing the Original Thirty, and Roni's own collection.

alter table public.contributions add column imported_at timestamptz;

alter table public.contributor_profiles
  add column voice_media_id uuid references public.media_assets (id) on delete set null,
  add column video_media_id uuid references public.media_assets (id) on delete set null;
create index contributor_profiles_portrait_idx on public.contributor_profiles (portrait_media_id);
create index contributor_profiles_voice_idx on public.contributor_profiles (voice_media_id);
create index contributor_profiles_video_idx on public.contributor_profiles (video_media_id);
create index letters_voice_idx on public.letters (voice_media_id);
create index letters_photo_idx on public.letters (photo_media_id);
create index timeline_milestones_featured_idx on public.timeline_milestones (featured_media_id);

-- ---------------------------------------------------------------------------
-- Review: status change and its audit record happen together.
-- Rejecting, hiding or reopening a submission unpublishes everything derived from it.
-- ---------------------------------------------------------------------------
create or replace function public.admin_review_contribution(
  p_contribution_id uuid,
  p_action public.approval_action,
  p_notes text default null,
  p_correction text default null
)
returns public.contribution_status
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_current public.contributions%rowtype;
  v_status public.contribution_status;
begin
  if not private.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  select * into v_current from public.contributions where id = p_contribution_id for update;
  if not found then
    raise exception 'Contribution not found' using errcode = 'P0002';
  end if;
  if v_current.status = 'draft' then
    raise exception 'Drafts cannot be reviewed until they are submitted' using errcode = '22023';
  end if;

  v_status := case p_action
    when 'approved' then 'approved'
    when 'rejected' then 'rejected'
    when 'changes_requested' then 'changes_requested'
    when 'hidden' then 'hidden'
    when 'restored' then 'in_review'
  end::public.contribution_status;
  if v_status is null then
    raise exception 'Unsupported review action' using errcode = '22023';
  end if;
  if p_action = 'changes_requested' and coalesce(btrim(p_correction), '') = '' then
    raise exception 'Explain what the contributor should change' using errcode = '22023';
  end if;

  begin
    update public.contributions
       set status = v_status,
           reviewed_at = now(),
           reviewed_by = (select auth.uid()),
           review_notes = coalesce(nullif(btrim(p_notes), ''), review_notes),
           correction_request = case when p_action = 'changes_requested' then btrim(p_correction) else correction_request end
     where id = p_contribution_id;
  exception when unique_violation then
    raise exception 'This contributor already has another contribution in progress, so this one cannot be reopened yet'
      using errcode = '23505';
  end;

  if p_action in ('rejected', 'hidden', 'changes_requested') then
    update public.memories set is_published = false where contribution_id = p_contribution_id and is_published;
    update public.birthday_wishes set is_published = false where contribution_id = p_contribution_id and is_published;
    update public.letters set is_published = false where contribution_id = p_contribution_id and is_published;
    update public.media_assets set is_published = false where contribution_id = p_contribution_id and is_published;
  end if;

  insert into public.content_approvals (contribution_id, action, notes, actor_id)
  values (p_contribution_id, p_action, nullif(btrim(coalesce(p_correction, p_notes, '')), ''), (select auth.uid()));

  return v_status;
end;
$$;

-- ---------------------------------------------------------------------------
-- Import: copies an approved submission into the Original Thirty as unpublished drafts.
-- The frozen original stays untouched. Attribution and audience follow the contributor's
-- own choices and are derived here, never taken from the client.
-- p_items: { memories: [{ title, story, category }], wish: text, letter: text, profile_message: text }
-- ---------------------------------------------------------------------------
create or replace function public.admin_import_contribution(p_contribution_id uuid, p_items jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  c public.contributions%rowtype;
  v_collection uuid;
  v_full_name text;
  v_relationship text;
  v_attribution text;
  v_audience public.audience;
  v_item jsonb;
  v_memory uuid;
  v_first_memory uuid;
  v_memories integer := 0;
  v_wish boolean := false;
  v_letter boolean := false;
  v_profile boolean := false;
begin
  if not private.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  select * into c from public.contributions where id = p_contribution_id for update;
  if not found then
    raise exception 'Contribution not found' using errcode = 'P0002';
  end if;
  if c.status <> 'approved' then
    raise exception 'Approve the contribution before adding it to the archive' using errcode = '22023';
  end if;
  if c.imported_at is not null then
    raise exception 'This contribution has already been added to the archive' using errcode = '23505';
  end if;
  if c.message_visibility = 'curator_only' then
    raise exception 'The contributor asked for this to be seen by the curator only' using errcode = '22023';
  end if;

  select id into v_collection from public.archive_collections where kind = 'original_thirty';
  if private.collection_is_locked(v_collection) then
    raise exception 'The Original Thirty is locked' using errcode = '42501';
  end if;

  v_full_name := nullif(btrim(c.submitted_payload #>> '{payload,introduction,fullName}'), '');
  v_relationship := nullif(btrim(c.submitted_payload #>> '{payload,introduction,relationship}'), '');
  v_attribution := case c.name_visibility
    when 'full_name' then v_full_name
    when 'first_name' then split_part(v_full_name, ' ', 1)
    else null
  end;
  v_audience := case c.message_visibility when 'roni_only' then 'roni_only' else 'everyone' end;

  for v_item in select value from jsonb_array_elements(coalesce(p_items -> 'memories', '[]'::jsonb)) loop
    continue when coalesce(btrim(v_item ->> 'story'), '') = '';
    insert into public.memories (
      collection_id, contribution_id, contributor_id, title, story, year, date_precision, life_stage,
      chapter, category, attribution, audience, sort_order, created_by
    ) values (
      v_collection, c.id, c.contributor_id,
      left(coalesce(nullif(btrim(v_item ->> 'title'), ''), 'A memory'), 200),
      left(v_item ->> 'story', 20000),
      c.memory_year, coalesce(c.date_precision, 'unknown'), c.life_stage, c.suggested_chapter,
      left(nullif(v_item ->> 'category', ''), 60), v_attribution, v_audience, v_memories, (select auth.uid())
    ) returning id into v_memory;
    v_first_memory := coalesce(v_first_memory, v_memory);
    v_memories := v_memories + 1;
  end loop;

  if v_first_memory is not null then
    insert into public.memory_media (memory_id, media_id, sort_order)
    select v_first_memory, m.id, (row_number() over (order by m.created_at))::integer
      from public.media_assets m
     where m.contribution_id = c.id and m.status = 'verified' and m.purpose in ('photo', 'video');
  end if;

  if coalesce(btrim(p_items ->> 'wish'), '') <> '' then
    insert into public.birthday_wishes (collection_id, contribution_id, contributor_id, author_display, message, audience)
    values (v_collection, c.id, c.contributor_id, v_attribution, left(btrim(p_items ->> 'wish'), 2000), v_audience);
    v_wish := true;
  end if;

  if coalesce(btrim(p_items ->> 'letter'), '') <> '' then
    insert into public.letters (collection_id, contribution_id, contributor_id, author_display, body, voice_media_id, audience)
    values (
      v_collection, c.id, c.contributor_id, v_attribution, left(p_items ->> 'letter', 40000),
      (select id from public.media_assets where contribution_id = c.id and purpose = 'voice' and status = 'verified' limit 1),
      v_audience
    );
    v_letter := true;
  end if;

  -- A profile gives a face to the words; anonymous contributors do not get one.
  if v_attribution is not null then
    insert into public.contributor_profiles (
      contributor_id, display_name, relationship_label, message, portrait_media_id, voice_media_id, video_media_id
    ) values (
      c.contributor_id, v_attribution, v_relationship, nullif(btrim(p_items ->> 'profile_message'), ''),
      (select id from public.media_assets where contribution_id = c.id and purpose = 'profile_photo' and status = 'verified' limit 1),
      (select id from public.media_assets where contribution_id = c.id and purpose = 'voice' and status = 'verified' limit 1),
      (select id from public.media_assets where contribution_id = c.id and purpose = 'video' and status = 'verified' limit 1)
    )
    on conflict (contributor_id) do update set
      message = coalesce(public.contributor_profiles.message, excluded.message),
      portrait_media_id = coalesce(public.contributor_profiles.portrait_media_id, excluded.portrait_media_id),
      voice_media_id = coalesce(public.contributor_profiles.voice_media_id, excluded.voice_media_id),
      video_media_id = coalesce(public.contributor_profiles.video_media_id, excluded.video_media_id);
    v_profile := true;
  end if;

  update public.media_assets set audience = v_audience where contribution_id = c.id;
  update public.contributions set imported_at = now() where id = c.id;
  insert into public.content_approvals (contribution_id, action, notes, actor_id)
  values (c.id, 'edited', 'Added to the archive as unpublished drafts', (select auth.uid()));

  return jsonb_build_object('memories', v_memories, 'wish', v_wish, 'letter', v_letter, 'profile', v_profile);
end;
$$;

-- ---------------------------------------------------------------------------
-- Wishes: assign all 30 stars in one statement set (star_index is unique per collection).
-- p_assignments: [{ id, star }] where star is 1..30 or null; p_final: wish id or null.
-- ---------------------------------------------------------------------------
create or replace function public.admin_arrange_wishes(p_assignments jsonb, p_final uuid default null)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_collection uuid;
begin
  if not private.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  select id into v_collection from public.archive_collections where kind = 'original_thirty';
  if private.collection_is_locked(v_collection) then
    raise exception 'The Original Thirty is locked' using errcode = '42501';
  end if;

  update public.birthday_wishes set star_index = null, is_final_star = false
   where collection_id = v_collection and (star_index is not null or is_final_star);

  update public.birthday_wishes w
     set star_index = (a ->> 'star')::smallint
    from jsonb_array_elements(coalesce(p_assignments, '[]'::jsonb)) a
   where w.id = (a ->> 'id')::uuid
     and w.collection_id = v_collection
     and nullif(a ->> 'star', '') is not null;

  if p_final is not null then
    update public.birthday_wishes set is_final_star = true where id = p_final and collection_id = v_collection;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Experience access: tells the client which screen to show. Content itself is still
-- protected by row-level security, so this grants nothing on its own.
-- ---------------------------------------------------------------------------
create or replace function public.experience_access()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'signed_in', (select auth.uid()) is not null,
    'is_admin', private.is_admin(),
    'is_roni', private.has_role('roni'),
    'is_family', private.has_role('family_viewer'),
    'live', private.experience_is_live(),
    'family_enabled', coalesce((select family_access_enabled from public.site_settings where id = 1), false),
    'preview_enabled', coalesce((select preview_enabled from public.site_settings where id = 1), false),
    'can_view', private.can_view_experience()
  );
$$;

-- ---------------------------------------------------------------------------
-- Freezing the Original Thirty also freezes chapters, editorial copy, people and
-- the media they use. Reads are unaffected; Roni's own collection stays writable.
-- ---------------------------------------------------------------------------
create or replace function private.original_is_locked()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select is_locked from public.archive_collections where kind = 'original_thirty'), false);
$$;

do $$
declare t text;
begin
  foreach t in array array['chapters', 'experience_content', 'contributor_profiles'] loop
    execute format(
      'create policy %I on public.%I as restrictive for insert to authenticated with check (not (select private.original_is_locked()))',
      t || ': frozen when locked (insert)', t);
    execute format(
      'create policy %I on public.%I as restrictive for update to authenticated using (not (select private.original_is_locked()))',
      t || ': frozen when locked (update)', t);
    execute format(
      'create policy %I on public.%I as restrictive for delete to authenticated using (not (select private.original_is_locked()))',
      t || ': frozen when locked (delete)', t);
  end loop;
end;
$$;

create policy "media_assets: frozen when locked (insert)" on public.media_assets
  as restrictive for insert to authenticated
  with check (not ((select private.original_is_locked()) and (collection_id is null or private.is_original_collection(collection_id))));
create policy "media_assets: frozen when locked (update)" on public.media_assets
  as restrictive for update to authenticated
  using (not ((select private.original_is_locked()) and (collection_id is null or private.is_original_collection(collection_id))));
create policy "media_assets: frozen when locked (delete)" on public.media_assets
  as restrictive for delete to authenticated
  using (not ((select private.original_is_locked()) and (collection_id is null or private.is_original_collection(collection_id))));

create or replace function public.admin_set_original_lock(p_locked boolean)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  update public.archive_collections
     set is_locked = p_locked,
         snapshot_at = case when p_locked then now() else snapshot_at end
   where kind = 'original_thirty';
end;
$$;

-- ---------------------------------------------------------------------------
-- Roni's Continuing Story collection, created on first use after launch.
-- ---------------------------------------------------------------------------
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
  select id into v_id from public.archive_collections
   where kind = 'continuing_story' and owner_id = (select auth.uid())
   order by created_at limit 1;
  if v_id is null then
    insert into public.archive_collections (kind, title, description, owner_id)
    values ('continuing_story', 'The Continuing Story', 'Everything that happens next.', (select auth.uid()))
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.admin_dashboard_stats()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'contributors', (select count(*) from public.contributors),
    'active_invitations', (select count(*) from public.invitations where status = 'active' and expires_at > now()),
    'drafts', (select count(*) from public.contributions where status = 'draft'),
    'submitted', (select count(*) from public.contributions where status in ('submitted', 'in_review')),
    'approved', (select count(*) from public.contributions where status = 'approved'),
    'rejected', (select count(*) from public.contributions where status = 'rejected'),
    'changes_requested', (select count(*) from public.contributions where status = 'changes_requested'),
    'hidden', (select count(*) from public.contributions where status = 'hidden'),
    'media', (select count(*) from public.media_assets where status = 'verified'),
    'milestones', (select count(*) from public.timeline_milestones m join public.archive_collections c on c.id = m.collection_id where c.kind = 'original_thirty'),
    'published_items', (
      (select count(*) from public.memories where is_published)
      + (select count(*) from public.birthday_wishes where is_published)
      + (select count(*) from public.letters where is_published)
    ),
    'featured_wishes', (select count(*) from public.birthday_wishes where star_index is not null),
    'open_removal_requests', (select count(*) from public.removal_requests where status = 'open'),
    'original_locked', private.original_is_locked()
  );
end;
$$;

revoke execute on function public.admin_review_contribution(uuid, public.approval_action, text, text) from public, anon;
revoke execute on function public.admin_import_contribution(uuid, jsonb) from public, anon;
revoke execute on function public.admin_arrange_wishes(jsonb, uuid) from public, anon;
revoke execute on function public.admin_set_original_lock(boolean) from public, anon;
revoke execute on function public.ensure_my_collection() from public, anon;
revoke execute on function public.experience_access() from public;
grant execute on function public.admin_review_contribution(uuid, public.approval_action, text, text) to authenticated;
grant execute on function public.admin_import_contribution(uuid, jsonb) to authenticated;
grant execute on function public.admin_arrange_wishes(jsonb, uuid) to authenticated;
grant execute on function public.admin_set_original_lock(boolean) to authenticated;
grant execute on function public.ensure_my_collection() to authenticated;
grant execute on function public.experience_access() to anon, authenticated;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;
