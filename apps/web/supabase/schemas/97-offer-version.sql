-- An immutable revision of an offer. number is unique within an offer. The
-- projector only ever inserts these rows (offer.version_added), never updates
-- them, so a submitted version is frozen. terms holds the versioned offer terms
-- validated app-side by offerTermsSchema (funding, contingencies, and the rest
-- live inside this jsonb, not in sibling tables). Deal-scoped through the parent
-- offer's deal; managed with deals.manage. calc_version_id is a plain uuid for
-- now; a later reconcile adds the foreign key to calc_version once that table
-- exists, the same deferral deal_financials.source_calc_version_id uses.

create table if not exists public.offer_version (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  offer_id uuid not null references public.offer (id) on delete cascade,
  number int not null,
  author_side text not null check (author_side in ('buyer', 'seller')),
  purchase_price numeric not null,
  real_estate_portion numeric,
  target_close_date date,
  offer_expires_at timestamptz,
  exclusivity_days int,
  diligence_days int,
  terms jsonb not null,
  calc_version_id uuid,
  approved_by uuid references auth.users,
  approved_at timestamptz,
  unique (offer_id, number)
);

alter table public.offer_version enable row level security;

create index ix_offer_version_offer on public.offer_version (offer_id);
create index ix_offer_version_account on public.offer_version (account_id);

-- Writes go through append_deal_event; the projector runs security definer as
-- the table owner and only inserts. authenticated and service_role keep read
-- only.
revoke all on public.offer_version from authenticated, service_role;
grant select on public.offer_version to authenticated;
grant select on public.offer_version to service_role;

create policy offer_version_read on public.offer_version
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or public.has_deal_permission(
      (select o.deal_id from public.offer o where o.id = offer_id),
      'deals.manage'
    )
  );

create policy offer_version_insert on public.offer_version
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy offer_version_update on public.offer_version
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy offer_version_delete on public.offer_version
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));
