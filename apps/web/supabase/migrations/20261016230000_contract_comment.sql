-- Comments on a whole contract version, from the team and both sides' counsel.
-- A comment is seen by whoever can see its version; an internal comment only
-- by the buyer side. Counsel are not team members, so their comments are
-- written by the server after it proves the caller is counsel.

create table if not exists public.contract_comment (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  contract_version_id uuid not null references public.contract_version (id) on delete cascade,
  parent_id uuid,
  author_user_id uuid references auth.users on delete set null,
  author_side public.counsel_side not null,
  quoted_text text,
  body text not null,
  internal boolean not null default false,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, contract_version_id),
  foreign key (parent_id, contract_version_id)
    references public.contract_comment (id, contract_version_id) on delete cascade,
  check (not internal or author_side = 'buyer')
);

create index if not exists ix_contract_comment_version on public.contract_comment (contract_version_id);

alter table public.contract_comment enable row level security;

revoke all on public.contract_comment from anon, authenticated, service_role;
grant select on public.contract_comment to authenticated;
grant insert (id, account_id, contract_version_id, parent_id, author_user_id, author_side, quoted_text, body, internal)
  on public.contract_comment to authenticated;
grant update (resolved_at) on public.contract_comment to authenticated;
grant select, insert, update, delete on public.contract_comment to service_role;

-- The version subquery runs under the caller's own policies, so comments
-- follow version visibility wherever that is defined.
create policy contract_comment_read on public.contract_comment
  for select to authenticated
  using (
    exists (select 1 from public.contract_version v where v.id = contract_version_id)
    and (
      not internal
      or public.has_role_on_account(account_id)
      or public.is_deal_counsel(
        (select c.deal_id
         from public.contract_version v
         join public.contract c on c.id = v.contract_id
         where v.id = contract_version_id),
        'buyer'
      )
    )
  );

create policy contract_comment_insert on public.contract_comment
  for insert to authenticated
  with check (
    author_user_id = (select auth.uid())
    and author_side = 'buyer'
    and public.has_permission((select auth.uid()), account_id, 'deals.manage')
  );

create policy contract_comment_resolve on public.contract_comment
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

-- ---- Billing lock ----
-- 'members' refuses only the team's own writes; counsel write through the
-- server as non-members.

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.contract_comment
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger same_team_contract_version_id
  before insert or update on public.contract_comment
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'contract_version_id', 'contract_version');
