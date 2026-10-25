-- Turns an edited sample item into real content. Items that came from a sample contributor
-- are detached from them and become curator content (people cards get a real contributor
-- record of their own), so nothing invented is ever presented as someone's contribution.
-- Refused while the item still carries sample photos or placeholder wording.

create or replace function public.admin_make_real(p_kind text, p_id text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_text text;
  v_media uuid[];
  v_profile public.contributor_profiles;
  v_contributor uuid;
begin
  if not private.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  if private.original_is_locked() then
    raise exception 'The Original Thirty is locked' using errcode = '42501';
  end if;

  case p_kind
    when 'memory' then
      select concat_ws(' ', title, story, caption, attribution), array(select media_id from public.memory_media where memory_id = m.id)
        into v_text, v_media from public.memories m where id = p_id::uuid and is_sample;
    when 'wish' then
      select concat_ws(' ', message, author_display), '{}'::uuid[]
        into v_text, v_media from public.birthday_wishes where id = p_id::uuid and is_sample;
    when 'letter' then
      select concat_ws(' ', salutation, body, author_display), array_remove(array[voice_media_id, photo_media_id], null)
        into v_text, v_media from public.letters where id = p_id::uuid and is_sample;
    when 'person' then
      select * into v_profile from public.contributor_profiles where id = p_id::uuid and is_sample;
      if found then
        v_text := concat_ws(' ', v_profile.display_name, v_profile.relationship_label, v_profile.message);
        v_media := array_remove(array[v_profile.portrait_media_id, v_profile.voice_media_id, v_profile.video_media_id], null);
      end if;
    when 'milestone' then
      select concat_ws(' ', title, description),
             array_remove(array[featured_media_id], null) || array(select media_id from public.milestone_media where milestone_id = t.id)
        into v_text, v_media from public.timeline_milestones t where id = p_id::uuid and is_sample;
    when 'editorial' then
      select content::text, array(select m.id from public.media_assets m where m.is_sample and e.content::text like '%' || m.id || '%')
        into v_text, v_media from public.experience_content e where key = p_id and is_sample;
    else
      raise exception 'Unknown kind %', p_kind using errcode = '22023';
  end case;

  if v_text is null then
    raise exception 'This item is not sample content' using errcode = '22023';
  end if;
  if exists (select 1 from public.media_assets where id = any(v_media) and is_sample) then
    raise exception 'Remove the sample photos first, then attach real ones if you like' using errcode = '22023';
  end if;
  if v_text ~* '\msample\M' then
    raise exception 'Some of the text still says “sample”. Replace the placeholder wording first' using errcode = '22023';
  end if;

  case p_kind
    when 'memory' then
      update public.memories set is_sample = false, contributor_id = null, contribution_id = null where id = p_id::uuid;
    when 'wish' then
      update public.birthday_wishes set is_sample = false, contributor_id = null, contribution_id = null, is_curator_original = true
       where id = p_id::uuid;
    when 'letter' then
      update public.letters set is_sample = false, contributor_id = null, contribution_id = null where id = p_id::uuid;
    when 'person' then
      insert into public.contributors (full_name, relationship, category, created_by)
      select v_profile.display_name, v_profile.relationship_label, c.category, auth.uid()
        from public.contributors c where c.id = v_profile.contributor_id
      returning id into v_contributor;
      update public.contributor_profiles set is_sample = false, contributor_id = v_contributor where id = v_profile.id;
    when 'milestone' then
      update public.timeline_milestones set is_sample = false where id = p_id::uuid;
    when 'editorial' then
      update public.experience_content set is_sample = false where key = p_id;
  end case;
end;
$$;

revoke execute on function public.admin_make_real(text, text) from public, anon;
grant execute on function public.admin_make_real(text, text) to authenticated;
