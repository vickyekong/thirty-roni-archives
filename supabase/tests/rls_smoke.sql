-- Row Level Security smoke test.
-- Runs entirely inside one transaction and finishes by raising an exception whose
-- message contains the JSON results, so every fixture is rolled back.
-- Run with the Supabase SQL editor, psql, or the MCP execute_sql tool.
--
-- Fixtures are prefixed "rls:" and every count is limited to them, so real archive
-- content does not affect the results.

begin;

create temp table t_results (seq serial, test text, pass boolean, detail text);
create temp table t_ids (name text primary key, id uuid);
grant all on t_results, t_ids to anon, authenticated;
grant usage on sequence t_results_seq_seq to anon, authenticated;

-- Helpers. They run with the caller's role, so RLS applies to the SQL they execute.
create function pg_temp.id(p_name text) returns uuid language sql stable as $$
  select id from t_ids where name = p_name
$$;

-- Passes when p_sql (one text column) returns exactly p_expected rows.
create function pg_temp.rows(p_test text, p_sql text, p_expected integer) returns void language plpgsql as $$
declare n integer; v text;
begin
  execute format('select count(*), coalesce(string_agg(v, '','' order by v), '''') from (%s) s(v)', p_sql) into n, v;
  insert into t_results (test, pass, detail) values (p_test, n = p_expected, n || ' row(s): ' || v);
exception when others then
  insert into t_results (test, pass, detail) values (p_test, false, 'error: ' || sqlerrm);
end $$;

-- A mistake in the test SQL itself must not count as "blocked".
create function pg_temp.is_test_bug(p_state text) returns boolean language sql immutable as $$
  select p_state in ('42601', '42702', '42703', '42804', '42883', '42P01', '22P02')
$$;

create function pg_temp.blocked(p_test text, p_sql text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    insert into t_results (test, pass, detail) values (p_test, not pg_temp.is_test_bug(sqlstate), sqlstate || ' ' || sqlerrm);
    return;
  end;
  insert into t_results (test, pass, detail) values (p_test, false, 'statement succeeded');
end $$;

create function pg_temp.allowed(p_test text, p_sql text) returns void language plpgsql as $$
begin
  execute p_sql;
  insert into t_results (test, pass, detail) values (p_test, true, 'ok');
exception when others then
  insert into t_results (test, pass, detail) values (p_test, false, sqlerrm);
end $$;

-- Passes when an UPDATE/DELETE statement touches no rows (RLS hides them).
create function pg_temp.untouched(p_test text, p_sql text) returns void language plpgsql as $$
declare n integer;
begin
  execute p_sql;
  get diagnostics n = row_count;
  insert into t_results (test, pass, detail) values (p_test, n = 0, n || ' row(s) changed');
exception when others then
  insert into t_results (test, pass, detail) values (p_test, not pg_temp.is_test_bug(sqlstate), sqlstate || ' ' || sqlerrm);
end $$;

create function pg_temp.check(p_test text, p_ok boolean, p_detail text) returns void language sql as $$
  insert into t_results (test, pass, detail) values (p_test, coalesce(p_ok, false), p_detail)
$$;
-- Fixtures (as the migration owner) ------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'admin@rls.test', '', now(), now(), now(), '{}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'roni@rls.test', '', now(), now(), now(), '{}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'family@rls.test', '', now(), now(), now(), '{}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'nobody@rls.test', '', now(), now(), now(), '{}', '{}');

insert into public.user_roles (user_id, role) values
  ('a0000000-0000-4000-8000-000000000001', 'admin'),
  ('a0000000-0000-4000-8000-000000000002', 'roni'),
  ('a0000000-0000-4000-8000-000000000003', 'family_viewer');

update public.archive_collections set is_locked = false where kind = 'original_thirty';
insert into t_ids select 'original', id from public.archive_collections where kind = 'original_thirty';
with c as (
  insert into public.archive_collections (kind, title, owner_id)
  values ('continuing_story', 'Continuing', 'a0000000-0000-4000-8000-000000000002') returning id
) insert into t_ids select 'continuing', id from c;

update public.chapters set is_published = (key = 'beginning');
insert into public.memories (collection_id, title, is_published, audience) values
  (pg_temp.id('original'), 'rls: original published', true, 'everyone'),
  (pg_temp.id('original'), 'rls: original unpublished', false, 'everyone'),
  (pg_temp.id('original'), 'rls: for roni only', true, 'roni_only'),
  (pg_temp.id('continuing'), 'rls: roni personal', true, 'everyone');

insert into public.birthday_wishes (collection_id, message, is_published, audience) values
  (pg_temp.id('original'), 'rls: wish published', true, 'everyone'),
  (pg_temp.id('original'), 'rls: wish unpublished', false, 'everyone'),
  (pg_temp.id('original'), 'rls: wish roni only', true, 'roni_only');
insert into public.letters (collection_id, body, is_published, audience) values
  (pg_temp.id('original'), 'rls: letter published', true, 'everyone'),
  (pg_temp.id('original'), 'rls: letter unpublished', false, 'everyone'),
  (pg_temp.id('original'), 'rls: letter roni only', true, 'roni_only');

with c as (insert into public.contributors (full_name, category) values ('rls: Parent', 'parent') returning id)
insert into t_ids select 'contributor', id from c;
with c as (insert into public.contributors (full_name, category) values ('rls: Friend', 'friend') returning id)
insert into t_ids select 'friend', id from c;
with c as (insert into public.contributors (full_name, category) values ('rls: Importer', 'friend') returning id)
insert into t_ids select 'importer', id from c;
update public.shared_links set status = 'revoked' where status = 'active';
with c as (
  insert into public.shared_links (token_hash, expires_at)
  values (encode(extensions.digest('rls: shared link', 'sha256'), 'hex'), now() + interval '7 days') returning id
) insert into t_ids select 'shared', id from c;
with c as (insert into public.contributions (contributor_id, status) values (pg_temp.id('contributor'), 'draft') returning id)
insert into t_ids select 'draft', id from c;
insert into public.contribution_drafts (contribution_id, payload) values (pg_temp.id('draft'), '{"note":"rls: private draft"}');
insert into public.contributor_profiles (contributor_id, display_name, is_published) values
  (pg_temp.id('contributor'), 'rls: profile published', true),
  (pg_temp.id('friend'), 'rls: profile unpublished', false);

insert into public.experience_content (key, content, is_published) values
  ('rls_test.published', '{}', true),
  ('rls_test.draft', '{}', false);

insert into public.media_assets (bucket, storage_path, kind, purpose, status, mime_type, collection_id, is_published) values
  ('archive', 'original/rls/published.jpg', 'image', 'curated', 'verified', 'image/jpeg', pg_temp.id('original'), true),
  ('archive', 'original/rls/draft.jpg', 'image', 'curated', 'verified', 'image/jpeg', pg_temp.id('original'), false),
  ('archive', 'continuing/a0000000-0000-4000-8000-000000000002/rls.jpg', 'image', 'photo', 'verified', 'image/jpeg', pg_temp.id('continuing'), false);
insert into storage.objects (bucket_id, name) values
  ('archive', 'original/rls/published.jpg'),
  ('archive', 'original/rls/draft.jpg'),
  ('archive', 'continuing/a0000000-0000-4000-8000-000000000002/rls.jpg');

-- Pre-launch state: switched off, launch time already passed.
update public.site_settings set experience_active = false, family_access_enabled = true, launch_at = now() - interval '1 day';

-- Anonymous ---------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select pg_temp.rows('anon: cannot read contributors', 'select full_name from public.contributors', 0);
select pg_temp.rows('anon: cannot read chapters', 'select key::text from public.chapters', 0);
select pg_temp.rows('anon: cannot read memories', 'select title from public.memories', 0);
select pg_temp.rows('anon: cannot read wishes', 'select message from public.birthday_wishes', 0);
select pg_temp.rows('anon: cannot read letters', 'select body from public.letters', 0);
select pg_temp.rows('anon: cannot read media files', $$select name from storage.objects where name like '%rls%'$$, 0);
select pg_temp.rows('anon: can read launch settings', 'select launch_at::text from public.site_settings', 1);
select pg_temp.check('anon: experience_access grants nothing',
  (public.experience_access() ->> 'can_view')::boolean = false and (public.experience_access() ->> 'signed_in')::boolean = false,
  public.experience_access()::text);
select pg_temp.blocked('anon: cannot call rate limiter', $$select public.consume_rate_limit('x', 1, 60)$$);
select pg_temp.blocked('anon: cannot create invitations', format('select * from public.admin_create_invitation(%L, 30)', pg_temp.id('contributor')));
select pg_temp.blocked('anon: cannot create a personal collection', 'select public.ensure_my_collection()');
select pg_temp.rows('anon: cannot read shared links', format('select id::text from public.shared_links where id = %L', pg_temp.id('shared')), 0);
select pg_temp.blocked('anon: cannot create a shared link', 'select * from public.admin_create_shared_link(30)');
reset role;

-- Signed in, no role ------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000004","role":"authenticated"}';
select pg_temp.rows('no role: cannot read contributors', 'select full_name from public.contributors', 0);
select pg_temp.rows('no role: cannot read memories', 'select title from public.memories', 0);
select pg_temp.blocked('no role: cannot create invitations', format('select * from public.admin_create_invitation(%L, 30)', pg_temp.id('contributor')));
select pg_temp.blocked('no role: cannot self-grant admin', $$insert into public.user_roles (user_id, role) values ('a0000000-0000-4000-8000-000000000004', 'admin')$$);
select pg_temp.untouched('no role: cannot change launch settings', 'update public.site_settings set experience_active = true');
select pg_temp.blocked('no role: cannot lock the original', 'select public.admin_set_original_lock(true)');
select pg_temp.blocked('no role: cannot arrange wishes', $$select public.admin_arrange_wishes('[]'::jsonb, null)$$);
select pg_temp.blocked('no role: cannot review submissions', format($$select public.admin_review_contribution(%L, 'approved')$$, gen_random_uuid()));
select pg_temp.blocked('no role: cannot import submissions', format($$select public.admin_import_contribution(%L, '{}'::jsonb)$$, gen_random_uuid()));
select pg_temp.blocked('no role: cannot create a personal collection', 'select public.ensure_my_collection()');
select pg_temp.rows('no role: cannot read shared links', format('select id::text from public.shared_links where id = %L', pg_temp.id('shared')), 0);
select pg_temp.blocked('no role: cannot create a shared link', 'select * from public.admin_create_shared_link(30)');
select pg_temp.blocked('no role: cannot insert a shared link', $$insert into public.shared_links (token_hash, expires_at) values (repeat('a', 64), now() + interval '1 day')$$);
select pg_temp.untouched('no role: cannot turn off the shared link', format($$update public.shared_links set status = 'revoked' where id = %L$$, pg_temp.id('shared')));
reset role;

-- Family viewer before launch -----------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000003","role":"authenticated"}';
select pg_temp.rows('family pre-launch: no memories', 'select title from public.memories', 0);
select pg_temp.rows('family pre-launch: no chapters', 'select key::text from public.chapters', 0);
select pg_temp.rows('family pre-launch: no wishes', $$select message from public.birthday_wishes where message like 'rls:%'$$, 0);
select pg_temp.rows('family pre-launch: no letters', $$select body from public.letters where body like 'rls:%'$$, 0);
select pg_temp.rows('family pre-launch: no people', $$select display_name from public.contributor_profiles where display_name like 'rls:%'$$, 0);
select pg_temp.rows('family pre-launch: no editorial copy', $$select key from public.experience_content where key like 'rls_test.%'$$, 0);
select pg_temp.rows('family pre-launch: no media rows', $$select storage_path from public.media_assets where storage_path like '%rls%'$$, 0);
select pg_temp.rows('family pre-launch: cannot sign media files', $$select name from storage.objects where name like '%rls%'$$, 0);
select pg_temp.check('family pre-launch: experience_access says no',
  (public.experience_access() ->> 'can_view')::boolean = false and (public.experience_access() ->> 'is_family')::boolean,
  public.experience_access()::text);
reset role;

-- Roni before launch
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}';
select pg_temp.rows('roni pre-launch: only her own collection items', $$select title from public.memories where title like 'rls:%'$$, 1);
select pg_temp.blocked('roni pre-launch: cannot write yet', format($$insert into public.memories (collection_id, title) values (%L, 'rls: too early')$$, pg_temp.id('continuing')));
select pg_temp.blocked('roni pre-launch: cannot create her collection yet', 'select public.ensure_my_collection()');
reset role;

-- Switched on but launch time not reached: the countdown alone unlocks nothing ---------
update public.site_settings set experience_active = true, launch_at = now() + interval '1 day';
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000003","role":"authenticated"}';
select pg_temp.rows('family before launch time: no memories', 'select title from public.memories', 0);
select pg_temp.rows('family before launch time: no wishes', $$select message from public.birthday_wishes where message like 'rls:%'$$, 0);
select pg_temp.check('family before launch time: not live', (public.experience_access() ->> 'live')::boolean = false, public.experience_access()::text);
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}';
select pg_temp.rows('roni before launch time: no original content', $$select title from public.memories where collection_id = (select id from t_ids where name = 'original')$$, 0);
select pg_temp.blocked('roni before launch time: cannot create her collection', 'select public.ensure_my_collection()');
reset role;

-- Launch -----------------------------------------------------------------------------
update public.site_settings set experience_active = true, launch_at = now() - interval '1 minute';

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000003","role":"authenticated"}';
select pg_temp.rows('family live: sees only published original, everyone-audience', $$select title from public.memories where title like 'rls:%'$$, 1);
select pg_temp.rows('family live: sees only published chapters', 'select key::text from public.chapters', 1);
select pg_temp.rows('family live: only published everyone wishes', $$select message from public.birthday_wishes where message like 'rls:%'$$, 1);
select pg_temp.rows('family live: only published everyone letters', $$select body from public.letters where body like 'rls:%'$$, 1);
select pg_temp.rows('family live: only published people', $$select display_name from public.contributor_profiles where display_name like 'rls:%'$$, 1);
select pg_temp.rows('family live: only published editorial copy', $$select key from public.experience_content where key like 'rls_test.%'$$, 1);
select pg_temp.rows('family live: only published media rows', $$select storage_path from public.media_assets where storage_path like '%rls%'$$, 1);
select pg_temp.rows('family live: can sign only published files', $$select name from storage.objects where name like '%rls%'$$, 1);
select pg_temp.rows('family live: cannot read contributors', 'select full_name from public.contributors', 0);
select pg_temp.rows('family live: cannot read contributions', 'select id::text from public.contributions', 0);
select pg_temp.rows('family live: cannot read drafts', 'select contribution_id::text from public.contribution_drafts', 0);
select pg_temp.rows('family live: cannot see continuing story', format('select title from public.memories where collection_id = %L', pg_temp.id('continuing')), 0);
select pg_temp.check('family live: experience_access says yes', (public.experience_access() ->> 'can_view')::boolean, public.experience_access()::text);
select pg_temp.blocked('family live: cannot create a personal collection', 'select public.ensure_my_collection()');
select pg_temp.blocked('family live: cannot write to the continuing story', format($$insert into public.memories (collection_id, title) values (%L, 'rls: intruder')$$, pg_temp.id('continuing')));
select pg_temp.rows('family live: cannot read shared links', format('select id::text from public.shared_links where id = %L', pg_temp.id('shared')), 0);
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}';
select pg_temp.rows('roni live: sees published original + roni-only + her own', $$select title from public.memories where title like 'rls:%'$$, 3);
select pg_temp.rows('roni live: published wishes incl. roni-only', $$select message from public.birthday_wishes where message like 'rls:%'$$, 2);
select pg_temp.rows('roni live: published letters incl. roni-only', $$select body from public.letters where body like 'rls:%'$$, 2);
select pg_temp.rows('roni live: published media and her own', $$select storage_path from public.media_assets where storage_path like '%rls%'$$, 2);
select pg_temp.rows('roni live: can sign published files and her own', $$select name from storage.objects where name like '%rls%'$$, 2);
select pg_temp.rows('roni live: cannot read contributions', 'select id::text from public.contributions', 0);
select pg_temp.rows('roni live: cannot read drafts', 'select contribution_id::text from public.contribution_drafts', 0);
select pg_temp.check('roni live: experience_access says yes',
  (public.experience_access() ->> 'can_view')::boolean and (public.experience_access() ->> 'is_roni')::boolean,
  public.experience_access()::text);
select pg_temp.check('roni live: ensure_my_collection returns her one collection',
  public.ensure_my_collection() = pg_temp.id('continuing') and public.ensure_my_collection() = pg_temp.id('continuing'), 'same id twice');
select pg_temp.blocked('roni live: cannot write to original collection', format($$insert into public.memories (collection_id, title) values (%L, 'rls: overwrite attempt')$$, pg_temp.id('original')));
select pg_temp.blocked('roni live: cannot add a milestone to the original', format($$insert into public.timeline_milestones (collection_id, title, year, chapter) values (%L, 'rls: x', 2026, 'thirty')$$, pg_temp.id('original')));
select pg_temp.allowed('roni live: can write to continuing story', format($$insert into public.memories (collection_id, title) values (%L, 'rls: new reflection')$$, pg_temp.id('continuing')));
select pg_temp.untouched('roni live: cannot edit original memories', $$update public.memories set title = 'edited' where title = 'rls: original published'$$);
select pg_temp.untouched('roni live: cannot delete original memories', $$delete from public.memories where title = 'rls: original published'$$);
select pg_temp.allowed('roni live: can catalogue a file in her own folder', format(
  $$insert into public.media_assets (bucket, storage_path, kind, purpose, status, mime_type, collection_id, uploaded_by)
    values ('archive', 'continuing/a0000000-0000-4000-8000-000000000002/new.jpg', 'image', 'photo', 'verified', 'image/jpeg', %L, 'a0000000-0000-4000-8000-000000000002')$$, pg_temp.id('continuing')));
select pg_temp.blocked('roni live: cannot catalogue someone else''s file', format(
  $$insert into public.media_assets (bucket, storage_path, kind, purpose, status, mime_type, collection_id)
    values ('archive', 'original/rls/draft-copy.jpg', 'image', 'photo', 'verified', 'image/jpeg', %L)$$, pg_temp.id('continuing')));
select pg_temp.blocked('roni live: cannot catalogue another user''s folder', format(
  $$insert into public.media_assets (bucket, storage_path, kind, purpose, status, mime_type, collection_id)
    values ('archive', 'continuing/a0000000-0000-4000-8000-000000000003/x.jpg', 'image', 'photo', 'verified', 'image/jpeg', %L)$$, pg_temp.id('continuing')));
select pg_temp.blocked('roni live: cannot add media to the original', format(
  $$insert into public.media_assets (bucket, storage_path, kind, purpose, status, mime_type, collection_id)
    values ('archive', 'continuing/a0000000-0000-4000-8000-000000000002/o.jpg', 'image', 'photo', 'verified', 'image/jpeg', %L)$$, pg_temp.id('original')));
select pg_temp.untouched('roni live: cannot repoint her media at another file', $$update public.media_assets set storage_path = 'original/rls/draft.jpg' where storage_path like 'continuing/a0000000-0000-4000-8000-000000000002/%'$$);
select pg_temp.allowed('roni live: can upload into her own folder', $$insert into storage.objects (bucket_id, name) values ('archive', 'continuing/a0000000-0000-4000-8000-000000000002/upload.jpg')$$);
select pg_temp.blocked('roni live: cannot upload outside her folder', $$insert into storage.objects (bucket_id, name) values ('archive', 'original/rls/evil.jpg')$$);
reset role;

-- Roni's collection can be locked too; it stays readable
update public.archive_collections set is_locked = true where id = pg_temp.id('continuing');
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}';
select pg_temp.blocked('roni locked: cannot add', format($$insert into public.memories (collection_id, title) values (%L, 'rls: locked')$$, pg_temp.id('continuing')));
select pg_temp.untouched('roni locked: cannot edit', format($$update public.memories set title = 'x' where collection_id = %L$$, pg_temp.id('continuing')));
select pg_temp.rows('roni locked: still readable', format('select title from public.memories where collection_id = %L', pg_temp.id('continuing')), 2);
reset role;
update public.archive_collections set is_locked = false where id = pg_temp.id('continuing');

select pg_temp.blocked('integrity: only one continuing story per person',
  $$insert into public.archive_collections (kind, title, owner_id) values ('continuing_story', 'Second', 'a0000000-0000-4000-8000-000000000002')$$);

-- Family access switch
update public.site_settings set family_access_enabled = false;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000003","role":"authenticated"}';
select pg_temp.rows('family: access switch off hides content', 'select title from public.memories', 0);
select pg_temp.rows('family: access switch off hides files', $$select name from storage.objects where name like '%rls%'$$, 0);
select pg_temp.check('family: access switch off reflected in experience_access', (public.experience_access() ->> 'can_view')::boolean = false, public.experience_access()::text);
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}';
select pg_temp.check('roni: unaffected by the family switch', (public.experience_access() ->> 'can_view')::boolean, public.experience_access()::text);
select pg_temp.rows('roni: cannot read shared links', format('select id::text from public.shared_links where id = %L', pg_temp.id('shared')), 0);
select pg_temp.blocked('roni: cannot create a shared link', 'select * from public.admin_create_shared_link(30)');
reset role;

-- Admin -------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select pg_temp.rows('admin: reads contributors', $$select full_name from public.contributors where full_name like 'rls:%'$$, 3);
select pg_temp.rows('admin: reads all chapters', 'select key::text from public.chapters', 4);
select pg_temp.rows('admin: reads contributor drafts', format('select contribution_id::text from public.contribution_drafts where contribution_id = %L', pg_temp.id('draft')), 1);
select pg_temp.rows('admin: reads unpublished wishes', $$select message from public.birthday_wishes where message like 'rls:%'$$, 3);
do $$
declare v_token text;
begin
  select token into v_token from public.admin_create_invitation(pg_temp.id('contributor'), 30);
  perform pg_temp.check(
    'admin: creates invitation, stores only hash',
    v_token is not null and length(v_token) = 43
      and exists (select 1 from public.invitations where token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'))
      and not exists (select 1 from public.invitations where token_hash = v_token),
    'token length ' || length(v_token)
  );
end $$;
select pg_temp.rows('admin: reads shared links', format('select id::text from public.shared_links where id = %L', pg_temp.id('shared')), 1);
do $$
declare v_token text;
begin
  select token into v_token from public.admin_create_shared_link(30);
  perform pg_temp.check(
    'admin: creates shared link, stores only hash, replaces the old one',
    v_token is not null and length(v_token) = 43
      and exists (select 1 from public.shared_links where status = 'active' and token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'))
      and not exists (select 1 from public.shared_links where token_hash = v_token)
      and (select status from public.shared_links where id = pg_temp.id('shared')) = 'revoked'
      and (select count(*) from public.shared_links where status = 'active') = 1,
    'token length ' || length(v_token)
  );
end $$;
select pg_temp.rows('admin: audit log captured changes', 'select 1::text from public.audit_logs limit 1', 1);
reset role;

-- Review and import (fixtures inserted as owner, actions taken as admin)
with c as (
  insert into public.contributions (contributor_id, status, submitted_payload, submitted_at, consent_given)
  values (pg_temp.id('importer'), 'submitted',
    '{"payload":{"introduction":{"fullName":"rls: Importer Person","relationship":"Friend"}}}', now(), true)
  returning id
) insert into t_ids select 'to_import', id from c;
with c as (
  insert into public.contributions (contributor_id, status, submitted_payload, submitted_at, consent_given, message_visibility)
  values (pg_temp.id('friend'), 'submitted', '{"payload":{}}', now(), true, 'curator_only')
  returning id
) insert into t_ids select 'curator_only', id from c;

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select pg_temp.blocked('admin: cannot import before approval', format($$select public.admin_import_contribution(%L, '{"memories":[{"title":"rls: imported","story":"Story"}]}'::jsonb)$$, pg_temp.id('to_import')));
select pg_temp.allowed('admin: approves a submission', format($$select public.admin_review_contribution(%L, 'approved')$$, pg_temp.id('to_import')));
select pg_temp.allowed('admin: imports an approved submission', format($$select public.admin_import_contribution(%L, '{"memories":[{"title":"rls: imported","story":"Story"}],"wish":"rls: imported wish"}'::jsonb)$$, pg_temp.id('to_import')));
select pg_temp.rows('admin: imported items start unpublished', $$select title from public.memories where title = 'rls: imported' and not is_published$$, 1);
select pg_temp.blocked('admin: cannot import twice', format($$select public.admin_import_contribution(%L, '{"wish":"again"}'::jsonb)$$, pg_temp.id('to_import')));
select pg_temp.allowed('admin: approves a curator-only submission', format($$select public.admin_review_contribution(%L, 'approved')$$, pg_temp.id('curator_only')));
select pg_temp.blocked('admin: curator-only submissions cannot be imported', format($$select public.admin_import_contribution(%L, '{"wish":"x"}'::jsonb)$$, pg_temp.id('curator_only')));
update public.memories set is_published = true where title = 'rls: imported';
select pg_temp.allowed('admin: hides a submission', format($$select public.admin_review_contribution(%L, 'hidden')$$, pg_temp.id('to_import')));
select pg_temp.rows('admin: hiding unpublishes what was derived from it', $$select title from public.memories where title = 'rls: imported' and is_published$$, 0);
select pg_temp.allowed('admin: arranges wishes on stars', format($$select public.admin_arrange_wishes(jsonb_build_array(jsonb_build_object('id', %L, 'star', 1)), null)$$,
  (select id from public.birthday_wishes where message = 'rls: wish published')));
select pg_temp.rows('admin: star assignment saved', $$select message from public.birthday_wishes where message = 'rls: wish published' and star_index = 1$$, 1);
select pg_temp.allowed('admin: locks the Original Thirty', 'select public.admin_set_original_lock(true)');
reset role;

-- Locking the original collection blocks even admins
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select pg_temp.untouched('admin: locked original memories are read-only', $$update public.memories set title = 'edited' where title = 'rls: original published'$$);
select pg_temp.untouched('admin: locked chapters are read-only', $$update public.chapters set is_published = is_published$$);
select pg_temp.untouched('admin: locked editorial copy is read-only', $$update public.experience_content set content = '{}' where key like 'rls_test.%'$$);
select pg_temp.untouched('admin: locked people are read-only', $$update public.contributor_profiles set message = 'x' where display_name like 'rls:%'$$);
select pg_temp.untouched('admin: locked original media are read-only', $$update public.media_assets set alt_text = 'x' where storage_path like 'original/rls/%'$$);
select pg_temp.blocked('admin: cannot arrange wishes when locked', $$select public.admin_arrange_wishes('[]'::jsonb, null)$$);
select pg_temp.rows('admin: locked original still readable', $$select title from public.memories where title = 'rls: original published'$$, 1);
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}';
select pg_temp.allowed('roni: her story stays writable while the original is locked', format($$insert into public.memories (collection_id, title) values (%L, 'rls: after lock')$$, pg_temp.id('continuing')));
reset role;

-- Original submissions are immutable
with c as (
  insert into public.contributions (contributor_id, status, submitted_payload)
  values (pg_temp.id('contributor'), 'submitted', '{"a":1}') returning id
) insert into t_ids select 'contribution', id from c;
select pg_temp.blocked('original submission is immutable', format($$update public.contributions set submitted_payload = '{"a":2}' where id = %L$$, pg_temp.id('contribution')));

do $$ begin
  raise exception 'RLS_RESULTS %', (
    select json_build_object(
      'passed', count(*) filter (where pass),
      'failed', count(*) filter (where not pass),
      'failures', coalesce(json_agg(json_build_object('test', test, 'detail', detail) order by seq) filter (where not pass), '[]'::json),
      'tests', json_agg(test || ' => ' || left(detail, 90) order by seq)
    ) from t_results
  );
end $$;
