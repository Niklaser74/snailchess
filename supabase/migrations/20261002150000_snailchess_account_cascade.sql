-- Deleting an account deletes its Snäckschack data, as the series privacy
-- policy (snails.se/privacy.html) promises. A game and a series belong to
-- both players, so they go as a whole when either account goes: what is left
-- would carry the deleted player's moves and name. Sibling of snailmageddon's
-- 20261002150000_account_cascade.sql.
alter table public.snailchess_matches
  add constraint snailchess_matches_host_fkey foreign key (host) references auth.users (id) on delete cascade,
  add constraint snailchess_matches_guest_fkey foreign key (guest) references auth.users (id) on delete cascade;
alter table public.snailchess_series
  add constraint snailchess_series_host_fkey foreign key (host) references auth.users (id) on delete cascade,
  add constraint snailchess_series_guest_fkey foreign key (guest) references auth.users (id) on delete cascade,
  add constraint snailchess_series_winner_user_fkey foreign key (winner_user) references auth.users (id) on delete set null;
