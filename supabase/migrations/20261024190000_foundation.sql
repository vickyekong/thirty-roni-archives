-- THIRTY | THE RONI ARCHIVES — foundation schema
-- Roles, contribution pipeline, curated content, archive collections, settings, audit and security.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('admin', 'roni', 'family_viewer');
create type public.contributor_category as enum ('parent', 'sibling', 'friend');
create type public.invitation_status as enum ('active', 'revoked');
create type public.contribution_status as enum (
  'draft', 'submitted', 'in_review', 'approved', 'rejected', 'changes_requested', 'hidden'
);
create type public.name_visibility as enum ('full_name', 'first_name', 'anonymous');
create type public.message_visibility as enum ('everyone', 'roni_only', 'curator_only');
create type public.date_precision as enum ('specific_year', 'approximate_year', 'life_stage', 'unknown');
create type public.life_stage as enum ('early_childhood', 'childhood', 'teens', 'twenties', 'recent');
create type public.chapter_key as enum ('beginning', 'becoming', 'finding_her_way', 'thirty');
create type public.media_kind as enum ('image', 'video', 'audio', 'document');
create type public.media_purpose as enum ('profile_photo', 'photo', 'video', 'voice', 'curated');
create type public.media_status as enum ('pending_upload', 'verified', 'rejected');
create type public.collection_kind as enum ('original_thirty', 'continuing_story');
create type public.approval_action as enum (
  'submitted', 'resubmitted', 'approved', 'rejected', 'changes_requested', 'hidden', 'restored', 'edited'
);
create type public.audience as enum ('everyone', 'roni_only');

-- ---------------------------------------------------------------------------
-- Shared trigger helpers
-- ---------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Identity and roles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

-- Role checks run with definer rights so policies can consult user_roles
-- without granting clients direct visibility of other users' roles.
create or replace function private.has_role(_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid()) and role = _role
  );
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role('admin');
$$;

-- ---------------------------------------------------------------------------
-- Site settings (launch configuration only — never put unpublished content here,
-- because launch status is readable before sign-in for the countdown).
-- ---------------------------------------------------------------------------
create table public.site_settings (
  id smallint primary key default 1 check (id = 1),
  launch_at timestamptz not null default '2026-12-03 00:00:00+01',
  timezone text not null default 'Africa/Lagos' check (timezone = 'Africa/Lagos'),
  experience_active boolean not null default false,
  preview_enabled boolean not null default true,
  family_access_enabled boolean not null default false,
  contributions_open boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
insert into public.site_settings (id) values (1);

create or replace function private.experience_is_live()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select experience_active and now() >= launch_at from public.site_settings where id = 1),
    false
  );
$$;

create or replace function private.can_view_experience()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin()
    or (
      private.experience_is_live()
      and (
        private.has_role('roni')
        or (
          private.has_role('family_viewer')
          and coalesce((select family_access_enabled from public.site_settings where id = 1), false)
        )
      )
    );
$$;

-- ---------------------------------------------------------------------------
-- Contributors and invitations (private: admin + edge function only)
-- ---------------------------------------------------------------------------
create table public.contributors (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(full_name) between 1 and 120),
  relationship text check (char_length(relationship) <= 120),
  category public.contributor_category not null,
  email text check (email is null or char_length(email) <= 254),
  phone text check (phone is null or char_length(phone) <= 40),
  curator_notes text check (char_length(curator_notes) <= 4000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  contributor_id uuid not null references public.contributors (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  status public.invitation_status not null default 'active',
  expires_at timestamptz not null default (now() + interval '60 days'),
  last_used_at timestamptz,
  reminder_sent_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id) on delete set null
);
create index invitations_contributor_idx on public.invitations (contributor_id);

-- ---------------------------------------------------------------------------
-- Contributions: original submissions are preserved separately from curated content.
-- ---------------------------------------------------------------------------
create table public.contributions (
  id uuid primary key default gen_random_uuid(),
  contributor_id uuid not null references public.contributors (id) on delete cascade,
  invitation_id uuid references public.invitations (id) on delete set null,
  status public.contribution_status not null default 'draft',
  submitted_payload jsonb check (submitted_payload is null or pg_column_size(submitted_payload) < 262144),
  consent_given boolean not null default false,
  consent_at timestamptz,
  name_visibility public.name_visibility not null default 'full_name',
  message_visibility public.message_visibility not null default 'everyone',
  date_precision public.date_precision,
  memory_year smallint check (memory_year between 1996 and 2100),
  life_stage public.life_stage,
  suggested_chapter public.chapter_key,
  idempotency_key uuid unique,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null,
  review_notes text check (char_length(review_notes) <= 4000),
  correction_request text check (char_length(correction_request) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index contributions_contributor_idx on public.contributions (contributor_id);
create index contributions_status_idx on public.contributions (status);
-- Only one editable contribution per invitation at a time (duplicate-submission protection).
create unique index contributions_one_open_per_invitation
  on public.contributions (invitation_id)
  where status in ('draft', 'changes_requested');

create or replace function private.protect_original_submission()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.submitted_payload is not null
     and new.submitted_payload is distinct from old.submitted_payload
     and old.status <> 'changes_requested' then
    raise exception 'Original submissions are immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger contributions_protect_original
  before update on public.contributions
  for each row execute function private.protect_original_submission();

create table public.contribution_drafts (
  contribution_id uuid primary key references public.contributions (id) on delete cascade,
  payload jsonb not null default '{}'::jsonb check (pg_column_size(payload) < 262144),
  current_step smallint not null default 0 check (current_step between 0 and 20),
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

create table public.content_approvals (
  id uuid primary key default gen_random_uuid(),
  contribution_id uuid not null references public.contributions (id) on delete cascade,
  action public.approval_action not null,
  notes text check (char_length(notes) <= 4000),
  payload_snapshot jsonb,
  actor_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index content_approvals_contribution_idx on public.content_approvals (contribution_id);

-- ---------------------------------------------------------------------------
-- Archive collections: the locked "Original Thirty" and Roni's "Continuing Story".
-- ---------------------------------------------------------------------------
create table public.archive_collections (
  id uuid primary key default gen_random_uuid(),
  kind public.collection_kind not null,
  title text not null check (char_length(title) <= 200),
  description text check (char_length(description) <= 4000),
  owner_id uuid references auth.users (id) on delete set null,
  is_locked boolean not null default false,
  snapshot_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind = 'original_thirty' or owner_id is not null)
);
create unique index archive_collections_single_original
  on public.archive_collections (kind) where kind = 'original_thirty';
create index archive_collections_owner_idx on public.archive_collections (owner_id);

insert into public.archive_collections (kind, title, description)
values ('original_thirty', 'The Original Thirty', 'The curated birthday collection, preserved as it was presented on 3 December 2026.');

create or replace function private.collection_is_locked(_collection_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select is_locked from public.archive_collections where id = _collection_id), true);
$$;

-- Roni may only write to her own, unlocked continuing-story collection once the archive is live.
create or replace function private.owns_writable_collection(_collection_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role('roni')
    and private.experience_is_live()
    and exists (
      select 1 from public.archive_collections c
      where c.id = _collection_id
        and c.kind = 'continuing_story'
        and c.owner_id = (select auth.uid())
        and not c.is_locked
    );
$$;

create or replace function private.is_original_collection(_collection_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.archive_collections
    where id = _collection_id and kind = 'original_thirty'
  );
$$;

create or replace function private.owns_collection(_collection_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.archive_collections c
    where c.id = _collection_id
      and c.kind = 'continuing_story'
      and c.owner_id = (select auth.uid())
  );
$$;

-- ---------------------------------------------------------------------------
-- Curated content
-- ---------------------------------------------------------------------------
create table public.chapters (
  key public.chapter_key primary key,
  title text not null check (char_length(title) <= 200),
  kicker text check (char_length(kicker) <= 120),
  period_label text check (char_length(period_label) <= 60),
  start_year smallint,
  end_year smallint,
  description text check (char_length(description) <= 4000),
  sort_order smallint not null,
  is_published boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.chapters (key, kicker, title, period_label, start_year, end_year, sort_order) values
  ('beginning', 'Chapter One — The Beginning', 'Before the world knew her name.', '1996–2005', 1996, 2005, 1),
  ('becoming', 'Chapter Two — The Becoming', 'Somewhere between dreams and discoveries.', '2006–2015', 2006, 2015, 2),
  ('finding_her_way', 'Chapter Three — Finding Her Way', 'The woman she became.', '2016–2025', 2016, 2025, 3),
  ('thirty', 'Chapter Four — Thirty', 'The next chapter begins.', '2026', 2026, 2026, 4);

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  bucket text not null check (bucket in ('contributions', 'archive')),
  storage_path text not null check (char_length(storage_path) <= 512),
  kind public.media_kind not null,
  purpose public.media_purpose not null,
  status public.media_status not null default 'pending_upload',
  mime_type text not null check (char_length(mime_type) <= 100),
  size_bytes bigint check (size_bytes >= 0),
  original_filename text check (char_length(original_filename) <= 255),
  width integer,
  height integer,
  duration_seconds numeric(10, 2),
  alt_text text check (char_length(alt_text) <= 1000),
  caption text check (char_length(caption) <= 2000),
  transcript text check (char_length(transcript) <= 20000),
  audience public.audience not null default 'everyone',
  contribution_id uuid references public.contributions (id) on delete cascade,
  collection_id uuid references public.archive_collections (id) on delete cascade,
  contributor_id uuid references public.contributors (id) on delete set null,
  uploaded_by uuid references auth.users (id) on delete set null,
  is_published boolean not null default false,
  sort_order integer not null default 0,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bucket, storage_path),
  check (num_nonnulls(contribution_id, collection_id) >= 1)
);
create index media_assets_contribution_idx on public.media_assets (contribution_id);
create index media_assets_collection_idx on public.media_assets (collection_id);
create index media_assets_contributor_idx on public.media_assets (contributor_id);

create table public.contributor_profiles (
  id uuid primary key default gen_random_uuid(),
  contributor_id uuid not null unique references public.contributors (id) on delete cascade,
  display_name text not null check (char_length(display_name) <= 120),
  relationship_label text check (char_length(relationship_label) <= 120),
  portrait_media_id uuid references public.media_assets (id) on delete set null,
  message text check (char_length(message) <= 8000),
  tone text check (tone in ('heartfelt', 'humorous', 'both')),
  sort_order integer not null default 0,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memories (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.archive_collections (id) on delete cascade,
  contribution_id uuid references public.contributions (id) on delete set null,
  contributor_id uuid references public.contributors (id) on delete set null,
  title text not null check (char_length(title) <= 200),
  story text check (char_length(story) <= 20000),
  caption text check (char_length(caption) <= 2000),
  year smallint check (year between 1996 and 2100),
  date_precision public.date_precision not null default 'unknown',
  life_stage public.life_stage,
  chapter public.chapter_key,
  category text check (char_length(category) <= 60),
  attribution text check (char_length(attribution) <= 160),
  audience public.audience not null default 'everyone',
  is_featured boolean not null default false,
  is_published boolean not null default false,
  is_sample boolean not null default false,
  sort_order integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index memories_collection_idx on public.memories (collection_id, chapter, sort_order);
create index memories_contribution_idx on public.memories (contribution_id);
create index memories_contributor_idx on public.memories (contributor_id);

create table public.timeline_milestones (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.archive_collections (id) on delete cascade,
  chapter public.chapter_key not null,
  year smallint not null check (year between 1996 and 2100),
  age smallint check (age between 0 and 120),
  title text not null check (char_length(title) <= 200),
  description text check (char_length(description) <= 8000),
  featured_media_id uuid references public.media_assets (id) on delete set null,
  is_published boolean not null default false,
  is_sample boolean not null default false,
  sort_order integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index timeline_milestones_collection_idx on public.timeline_milestones (collection_id, year, sort_order);

create table public.milestone_memories (
  milestone_id uuid not null references public.timeline_milestones (id) on delete cascade,
  memory_id uuid not null references public.memories (id) on delete cascade,
  sort_order integer not null default 0,
  primary key (milestone_id, memory_id)
);
create index milestone_memories_memory_idx on public.milestone_memories (memory_id);

create table public.milestone_media (
  milestone_id uuid not null references public.timeline_milestones (id) on delete cascade,
  media_id uuid not null references public.media_assets (id) on delete cascade,
  sort_order integer not null default 0,
  primary key (milestone_id, media_id)
);
create index milestone_media_media_idx on public.milestone_media (media_id);

create table public.memory_media (
  memory_id uuid not null references public.memories (id) on delete cascade,
  media_id uuid not null references public.media_assets (id) on delete cascade,
  sort_order integer not null default 0,
  primary key (memory_id, media_id)
);
create index memory_media_media_idx on public.memory_media (media_id);

create table public.birthday_wishes (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.archive_collections (id) on delete cascade,
  contribution_id uuid references public.contributions (id) on delete set null,
  contributor_id uuid references public.contributors (id) on delete set null,
  author_display text check (char_length(author_display) <= 160),
  message text not null check (char_length(message) between 1 and 2000),
  is_curator_original boolean not null default false,
  is_sample boolean not null default false,
  star_index smallint check (star_index between 1 and 30),
  is_final_star boolean not null default false,
  audience public.audience not null default 'everyone',
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index birthday_wishes_star_unique
  on public.birthday_wishes (collection_id, star_index) where star_index is not null;
create unique index birthday_wishes_single_final
  on public.birthday_wishes (collection_id) where is_final_star;
create index birthday_wishes_contribution_idx on public.birthday_wishes (contribution_id);
create index birthday_wishes_contributor_idx on public.birthday_wishes (contributor_id);

create table public.letters (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.archive_collections (id) on delete cascade,
  contribution_id uuid references public.contributions (id) on delete set null,
  contributor_id uuid references public.contributors (id) on delete set null,
  author_display text check (char_length(author_display) <= 160),
  salutation text check (char_length(salutation) <= 200),
  body text not null check (char_length(body) <= 40000),
  voice_media_id uuid references public.media_assets (id) on delete set null,
  photo_media_id uuid references public.media_assets (id) on delete set null,
  audience public.audience not null default 'everyone',
  is_featured boolean not null default false,
  is_published boolean not null default false,
  is_sample boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index letters_single_featured on public.letters (collection_id) where is_featured;
create index letters_contribution_idx on public.letters (contribution_id);
create index letters_contributor_idx on public.letters (contributor_id);

-- Editorial blocks (The Roni Times, opening copy, finale message) keyed by slot.
create table public.experience_content (
  key text primary key check (key ~ '^[a-z0-9_\.]{2,80}$'),
  content jsonb not null default '{}'::jsonb,
  is_published boolean not null default false,
  is_sample boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

-- ---------------------------------------------------------------------------
-- Removal requests, audit logs, rate limits
-- ---------------------------------------------------------------------------
create table public.removal_requests (
  id uuid primary key default gen_random_uuid(),
  contributor_id uuid references public.contributors (id) on delete set null,
  contribution_id uuid references public.contributions (id) on delete set null,
  requester_user_id uuid references auth.users (id) on delete set null,
  details text not null check (char_length(details) between 1 and 4000),
  status text not null default 'open' check (status in ('open', 'resolved', 'declined')),
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index removal_requests_contributor_idx on public.removal_requests (contributor_id);
create index removal_requests_contribution_idx on public.removal_requests (contribution_id);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_type text not null check (actor_type in ('user', 'contributor', 'system')),
  actor_id uuid,
  action text not null check (char_length(action) <= 80),
  entity_type text not null check (char_length(entity_type) <= 80),
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  ip_hash text,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);

create table public.rate_limits (
  bucket_key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket_key, window_start)
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'site_settings', 'contributors', 'contributions', 'archive_collections',
    'chapters', 'media_assets', 'contributor_profiles', 'memories', 'timeline_milestones',
    'birthday_wishes', 'letters', 'experience_content'
  ] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function private.set_updated_at()',
      t || '_set_updated_at', t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Audit trail for signed-in (administrative / archive owner) changes.
-- Contributor actions are logged explicitly by the edge function.
-- ---------------------------------------------------------------------------
create or replace function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_row jsonb;
  v_changed text[];
begin
  if v_actor is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'UPDATE' then
    select coalesce(array_agg(n.key), '{}')
      into v_changed
      from jsonb_each(to_jsonb(new)) n
      join jsonb_each(to_jsonb(old)) o using (key)
     where n.value is distinct from o.value and n.key <> 'updated_at';
    if cardinality(v_changed) = 0 then
      return new;
    end if;
  end if;

  v_row := to_jsonb(coalesce(new, old));
  insert into public.audit_logs (actor_type, actor_id, action, entity_type, entity_id, details)
  values (
    'user', v_actor, lower(tg_op), tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'key', v_row ->> 'user_id', v_row ->> 'contribution_id'),
    jsonb_build_object('changed', to_jsonb(v_changed))
  );
  return coalesce(new, old);
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'user_roles', 'site_settings', 'contributors', 'invitations', 'contributions', 'archive_collections',
    'chapters', 'media_assets', 'contributor_profiles', 'memories', 'timeline_milestones',
    'birthday_wishes', 'letters', 'experience_content', 'removal_requests'
  ] loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function private.audit_row_change()',
      t || '_audit', t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.site_settings enable row level security;
alter table public.contributors enable row level security;
alter table public.invitations enable row level security;
alter table public.contributions enable row level security;
alter table public.contribution_drafts enable row level security;
alter table public.content_approvals enable row level security;
alter table public.archive_collections enable row level security;
alter table public.chapters enable row level security;
alter table public.media_assets enable row level security;
alter table public.contributor_profiles enable row level security;
alter table public.memories enable row level security;
alter table public.timeline_milestones enable row level security;
alter table public.milestone_memories enable row level security;
alter table public.milestone_media enable row level security;
alter table public.memory_media enable row level security;
alter table public.birthday_wishes enable row level security;
alter table public.letters enable row level security;
alter table public.experience_content enable row level security;
alter table public.removal_requests enable row level security;
alter table public.audit_logs enable row level security;
alter table public.rate_limits enable row level security;

-- Profiles
create policy "profiles: read own or admin" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()));
create policy "profiles: insert own" on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));
create policy "profiles: update own or admin" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()))
  with check (id = (select auth.uid()) or (select private.is_admin()));

-- Roles: users can see their own roles; only admins grant or revoke.
create policy "user_roles: read own or admin" on public.user_roles
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));
create policy "user_roles: admin insert" on public.user_roles
  for insert to authenticated with check ((select private.is_admin()));
create policy "user_roles: admin delete" on public.user_roles
  for delete to authenticated using ((select private.is_admin()));

-- Launch settings: readable by anyone (contains no content), editable by admins.
create policy "site_settings: public read" on public.site_settings
  for select to anon, authenticated using (true);
create policy "site_settings: admin update" on public.site_settings
  for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- Admin-only tables. Contributors never touch these directly; the
-- `contribute` edge function mediates every contributor action.
do $$
declare t text;
begin
  foreach t in array array[
    'contributors', 'invitations', 'contributions', 'contribution_drafts', 'content_approvals', 'removal_requests'
  ] loop
    execute format(
      'create policy %I on public.%I for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()))',
      t || ': admin only', t
    );
  end loop;
end;
$$;

create policy "audit_logs: admin read" on public.audit_logs
  for select to authenticated using ((select private.is_admin()));
-- rate_limits: no policies; reachable only through the service role.

-- Archive collections
create policy "archive_collections: read" on public.archive_collections
  for select to authenticated
  using (
    (select private.is_admin())
    or owner_id = (select auth.uid())
    or (kind = 'original_thirty' and (select private.can_view_experience()))
  );
create policy "archive_collections: admin insert" on public.archive_collections
  for insert to authenticated with check ((select private.is_admin()));
create policy "archive_collections: admin or owner update" on public.archive_collections
  for update to authenticated
  using ((select private.is_admin()) or (kind = 'continuing_story' and owner_id = (select auth.uid())))
  with check (
    (select private.is_admin())
    or (kind = 'continuing_story' and owner_id = (select auth.uid()) and not is_locked)
  );
create policy "archive_collections: admin delete" on public.archive_collections
  for delete to authenticated using ((select private.is_admin()) and kind = 'continuing_story');

-- Chapters, editorial content, contributor profiles: published + live, or admin.
create policy "chapters: read" on public.chapters
  for select to authenticated
  using ((select private.is_admin()) or (is_published and (select private.can_view_experience())));
create policy "chapters: admin write" on public.chapters
  for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "experience_content: read" on public.experience_content
  for select to authenticated
  using ((select private.is_admin()) or (is_published and (select private.can_view_experience())));
create policy "experience_content: admin write" on public.experience_content
  for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "contributor_profiles: read" on public.contributor_profiles
  for select to authenticated
  using ((select private.is_admin()) or (is_published and (select private.can_view_experience())));
create policy "contributor_profiles: admin write" on public.contributor_profiles
  for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- Collection-scoped curated content (memories, milestones, wishes, letters).
do $$
declare t text;
begin
  foreach t in array array['memories', 'timeline_milestones', 'birthday_wishes', 'letters'] loop
    execute format($f$
      create policy %I on public.%I for select to authenticated using (
        (select private.is_admin())
        or (select private.owns_collection(collection_id))
        or (
          is_published
          and (select private.can_view_experience())
          and private.is_original_collection(collection_id)
        )
      )$f$, t || ': read', t);
    execute format($f$
      create policy %I on public.%I for insert to authenticated with check (
        ((select private.is_admin()) and not (select private.collection_is_locked(collection_id)))
        or (select private.owns_writable_collection(collection_id))
      )$f$, t || ': insert', t);
    execute format($f$
      create policy %I on public.%I for update to authenticated using (
        ((select private.is_admin()) and not (select private.collection_is_locked(collection_id)))
        or (select private.owns_writable_collection(collection_id))
      ) with check (
        ((select private.is_admin()) and not (select private.collection_is_locked(collection_id)))
        or (select private.owns_writable_collection(collection_id))
      )$f$, t || ': update', t);
    execute format($f$
      create policy %I on public.%I for delete to authenticated using (
        ((select private.is_admin()) and not (select private.collection_is_locked(collection_id)))
        or (select private.owns_writable_collection(collection_id))
      )$f$, t || ': delete', t);
  end loop;
end;
$$;

-- Roni-only content is hidden from family viewers.
create policy "memories: restrict roni-only audience" on public.memories
  as restrictive for select to authenticated
  using (audience = 'everyone' or (select private.has_role('roni')) or (select private.is_admin()));
create policy "birthday_wishes: restrict roni-only audience" on public.birthday_wishes
  as restrictive for select to authenticated
  using (audience = 'everyone' or (select private.has_role('roni')) or (select private.is_admin()));
create policy "letters: restrict roni-only audience" on public.letters
  as restrictive for select to authenticated
  using (audience = 'everyone' or (select private.has_role('roni')) or (select private.is_admin()));

-- Media
create policy "media_assets: read" on public.media_assets
  for select to authenticated
  using (
    (select private.is_admin())
    or (collection_id is not null and (select private.owns_collection(collection_id)))
    or (
      is_published and status = 'verified'
      and (select private.can_view_experience())
      and (audience = 'everyone' or (select private.has_role('roni')))
      and (collection_id is null or private.is_original_collection(collection_id))
    )
  );
create policy "media_assets: admin write" on public.media_assets
  for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "media_assets: owner insert" on public.media_assets
  for insert to authenticated
  with check (
    bucket = 'archive' and collection_id is not null
    and (select private.owns_writable_collection(collection_id))
  );
create policy "media_assets: owner update" on public.media_assets
  for update to authenticated
  using (collection_id is not null and (select private.owns_writable_collection(collection_id)))
  with check (bucket = 'archive' and collection_id is not null and (select private.owns_writable_collection(collection_id)));
create policy "media_assets: owner delete" on public.media_assets
  for delete to authenticated
  using (collection_id is not null and (select private.owns_writable_collection(collection_id)));

-- Join tables follow their parent's visibility.
create policy "milestone_memories: read" on public.milestone_memories
  for select to authenticated
  using (exists (select 1 from public.timeline_milestones m where m.id = milestone_id));
create policy "milestone_memories: write" on public.milestone_memories
  for all to authenticated
  using (exists (
    select 1 from public.timeline_milestones m
    where m.id = milestone_id
      and (((select private.is_admin()) and not private.collection_is_locked(m.collection_id))
           or private.owns_writable_collection(m.collection_id))
  ))
  with check (exists (
    select 1 from public.timeline_milestones m
    where m.id = milestone_id
      and (((select private.is_admin()) and not private.collection_is_locked(m.collection_id))
           or private.owns_writable_collection(m.collection_id))
  ));

create policy "milestone_media: read" on public.milestone_media
  for select to authenticated
  using (exists (select 1 from public.timeline_milestones m where m.id = milestone_id));
create policy "milestone_media: write" on public.milestone_media
  for all to authenticated
  using (exists (
    select 1 from public.timeline_milestones m
    where m.id = milestone_id
      and (((select private.is_admin()) and not private.collection_is_locked(m.collection_id))
           or private.owns_writable_collection(m.collection_id))
  ))
  with check (exists (
    select 1 from public.timeline_milestones m
    where m.id = milestone_id
      and (((select private.is_admin()) and not private.collection_is_locked(m.collection_id))
           or private.owns_writable_collection(m.collection_id))
  ));

create policy "memory_media: read" on public.memory_media
  for select to authenticated
  using (exists (select 1 from public.memories m where m.id = memory_id));
create policy "memory_media: write" on public.memory_media
  for all to authenticated
  using (exists (
    select 1 from public.memories m
    where m.id = memory_id
      and (((select private.is_admin()) and not private.collection_is_locked(m.collection_id))
           or private.owns_writable_collection(m.collection_id))
  ))
  with check (exists (
    select 1 from public.memories m
    where m.id = memory_id
      and (((select private.is_admin()) and not private.collection_is_locked(m.collection_id))
           or private.owns_writable_collection(m.collection_id))
  ));

-- ---------------------------------------------------------------------------
-- RPC functions
-- ---------------------------------------------------------------------------

-- Creates an invitation and returns the raw token exactly once; only its hash is stored.
-- Security invoker: the insert is subject to the admin-only RLS policy.
create or replace function public.admin_create_invitation(
  p_contributor_id uuid,
  p_expires_in_days integer default 60
)
returns table (invitation_id uuid, token text, expires_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_token text;
  v_id uuid;
  v_expires timestamptz;
begin
  if not private.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  if p_expires_in_days not between 1 and 365 then
    raise exception 'Expiry must be between 1 and 365 days' using errcode = '22023';
  end if;

  v_token := translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');

  insert into public.invitations (contributor_id, token_hash, expires_at, created_by)
  values (
    p_contributor_id,
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    now() + make_interval(days => p_expires_in_days),
    (select auth.uid())
  )
  returning id, invitations.expires_at into v_id, v_expires;

  return query select v_id, v_token, v_expires;
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
    'media', (select count(*) from public.media_assets where status = 'verified'),
    'milestones', (select count(*) from public.timeline_milestones),
    'featured_wishes', (select count(*) from public.birthday_wishes where star_index is not null),
    'open_removal_requests', (select count(*) from public.removal_requests where status = 'open')
  );
end;
$$;

-- Fixed-window rate limiter used by edge functions (service role only).
create or replace function public.consume_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  insert into public.rate_limits as r (bucket_key, window_start, hits)
  values (p_key, v_window, 1)
  on conflict (bucket_key, window_start) do update set hits = r.hits + 1
  returning hits into v_hits;

  if random() < 0.02 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_hits <= p_limit;
end;
$$;

revoke execute on function public.admin_create_invitation(uuid, integer) from public, anon;
revoke execute on function public.admin_dashboard_stats() from public, anon;
revoke execute on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_create_invitation(uuid, integer) to authenticated;
grant execute on function public.admin_dashboard_stats() to authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

-- Create a profile row for every new auth user.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();
