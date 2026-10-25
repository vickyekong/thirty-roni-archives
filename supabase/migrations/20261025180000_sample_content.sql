-- Clearly labelled sample content, so curators can see every section filled in before
-- real contributions arrive. Samples are visible to curators only, can be removed in one
-- step, and block locking the Original Thirty until they are gone.

alter table public.contributors add column is_sample boolean not null default false;
alter table public.contributor_profiles add column is_sample boolean not null default false;
alter table public.media_assets add column is_sample boolean not null default false;

-- Anything created from a sample contributor (imported memories, wishes, letters, profile
-- cards, uploads) is itself a sample, whichever path created it.
create or replace function private.inherit_sample_flag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.contributor_id is not null
     and exists (select 1 from public.contributors where id = new.contributor_id and is_sample) then
    new.is_sample := true;
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['memories', 'birthday_wishes', 'letters', 'contributor_profiles', 'media_assets'] loop
    execute format(
      'create trigger %I before insert on public.%I for each row execute function private.inherit_sample_flag()',
      t || '_inherit_sample', t);
  end loop;
end;
$$;

-- Only curators ever read samples, whatever else a policy allows. Storage reads check the
-- media row under these same rules, so sample files are hidden too.
do $$
declare t text;
begin
  foreach t in array array['memories', 'birthday_wishes', 'letters', 'contributor_profiles', 'media_assets',
                           'timeline_milestones', 'experience_content'] loop
    execute format(
      'create policy %I on public.%I as restrictive for select to authenticated using (not is_sample or (select private.is_admin()))',
      t || ': samples are curator-only', t);
  end loop;
end;
$$;

create or replace function private.sample_content_exists()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.contributors where is_sample)
      or exists (select 1 from public.memories where is_sample)
      or exists (select 1 from public.birthday_wishes where is_sample)
      or exists (select 1 from public.letters where is_sample)
      or exists (select 1 from public.contributor_profiles where is_sample)
      or exists (select 1 from public.media_assets where is_sample)
      or exists (select 1 from public.timeline_milestones where is_sample)
      or exists (select 1 from public.experience_content where is_sample);
$$;

-- Deletes every sample row and returns the storage objects the caller must remove
-- (storage files cannot be deleted from SQL).
create or replace function public.admin_clear_sample_content()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_files jsonb;
  v_counts jsonb;
begin
  if not private.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  if private.original_is_locked() then
    raise exception 'Unlock the Original Thirty before removing sample content' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('bucket', bucket, 'path', storage_path)), '[]'::jsonb)
    into v_files from public.media_assets where is_sample;

  v_counts := jsonb_build_object(
    'contributors', (select count(*) from public.contributors where is_sample),
    'memories', (select count(*) from public.memories where is_sample),
    'wishes', (select count(*) from public.birthday_wishes where is_sample),
    'letters', (select count(*) from public.letters where is_sample),
    'people', (select count(*) from public.contributor_profiles where is_sample),
    'milestones', (select count(*) from public.timeline_milestones where is_sample),
    'media', (select count(*) from public.media_assets where is_sample),
    'editorial', (select count(*) from public.experience_content where is_sample)
  );

  delete from public.timeline_milestones where is_sample;
  delete from public.memories where is_sample;
  delete from public.birthday_wishes where is_sample;
  delete from public.letters where is_sample;
  delete from public.contributor_profiles where is_sample;
  delete from public.experience_content where is_sample;
  delete from public.media_assets where is_sample;
  delete from public.contributors where is_sample;

  return jsonb_build_object('files', v_files, 'counts', v_counts);
end;
$$;

-- Locking freezes what Roni receives, so it must not contain samples.
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
  if p_locked and private.sample_content_exists() then
    raise exception 'Remove the sample content before locking the Original Thirty' using errcode = '22023';
  end if;
  update public.archive_collections
     set is_locked = p_locked,
         snapshot_at = case when p_locked then now() else snapshot_at end
   where kind = 'original_thirty';
end;
$$;

revoke execute on function public.admin_clear_sample_content() from public, anon;
grant execute on function public.admin_clear_sample_content() to authenticated;
revoke execute on function private.inherit_sample_flag() from public, anon;
revoke execute on function private.sample_content_exists() from public, anon;
grant execute on function private.sample_content_exists() to authenticated;
