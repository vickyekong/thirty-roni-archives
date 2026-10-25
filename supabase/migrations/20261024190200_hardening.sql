-- Deleting Roni's auth account must never orphan or silently delete her personal archive.
alter table public.archive_collections drop constraint archive_collections_owner_id_fkey;
alter table public.archive_collections
  add constraint archive_collections_owner_id_fkey
  foreign key (owner_id) references auth.users (id) on delete restrict;

create index contributions_invitation_idx on public.contributions (invitation_id);
