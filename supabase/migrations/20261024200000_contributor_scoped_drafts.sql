-- Drafts belong to the contributor, not to a particular link, so a curator can replace a
-- lost or leaked invitation without orphaning the contributor's unfinished work.
create unique index contributions_one_open_per_contributor
  on public.contributions (contributor_id)
  where status in ('draft', 'changes_requested');

drop index if exists public.contributions_one_open_per_invitation;
