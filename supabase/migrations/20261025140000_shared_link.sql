-- One link the curator can post to a whole group. Whoever opens it gives their name and
-- receives a personal invitation of their own, so everything after joining is scoped to
-- that person exactly as with a link the curator issued individually.
create table public.shared_links (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  status public.invitation_status not null default 'active',
  expires_at timestamptz not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id) on delete set null
);
create unique index shared_links_one_active on public.shared_links ((true)) where status = 'active';

alter table public.contributors
  add column shared_link_id uuid references public.shared_links (id) on delete set null;
create index contributors_shared_link_idx on public.contributors (shared_link_id);

alter table public.shared_links enable row level security;
create policy "shared_links: admin only" on public.shared_links
  for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create trigger shared_links_audit
  after insert or update or delete on public.shared_links
  for each row execute function private.audit_row_change();

-- Replaces any active shared link, so at most one works at a time.
create or replace function public.admin_create_shared_link(p_expires_in_days integer default 60)
returns table (shared_link_id uuid, token text, expires_at timestamptz)
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

  update public.shared_links
     set status = 'revoked', revoked_at = now(), revoked_by = (select auth.uid())
   where status = 'active';

  v_token := translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');

  insert into public.shared_links (token_hash, expires_at, created_by)
  values (
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    now() + make_interval(days => p_expires_in_days),
    (select auth.uid())
  )
  returning id, shared_links.expires_at into v_id, v_expires;

  return query select v_id, v_token, v_expires;
end;
$$;

revoke execute on function public.admin_create_shared_link(integer) from public, anon;
grant execute on function public.admin_create_shared_link(integer) to authenticated;
