-- Messages between the deal team and counsel, one thread per deal and side.
-- Neither side's counsel reads the other side's thread. Counsel are not team
-- members, so their messages are written by the server after it proves the
-- caller is counsel on that side.

create table if not exists public.counsel_message (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid not null references public.deal (id) on delete cascade,
  side public.counsel_side not null,
  author_user_id uuid references auth.users on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists ix_counsel_message_thread on public.counsel_message (deal_id, side, created_at);

alter table public.counsel_message enable row level security;

revoke all on public.counsel_message from anon, authenticated, service_role;
grant select on public.counsel_message to authenticated;
grant insert (id, account_id, deal_id, side, author_user_id, body) on public.counsel_message to authenticated;
grant select, insert, update, delete on public.counsel_message to service_role;

-- Realtime delivers a new message only to those this policy lets read it,
-- so it mirrors who counsel_thread shows the thread to.
create policy counsel_message_read on public.counsel_message
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or public.is_deal_counsel(deal_id, side)
  );

create policy counsel_message_insert on public.counsel_message
  for insert to authenticated
  with check (
    author_user_id = (select auth.uid())
    and public.manages_deal_in_account(deal_id, account_id)
  );

-- Reads go through this function so it can name authors that counsel could
-- not otherwise look up.
create or replace function public.counsel_thread(deal_id uuid, side public.counsel_side)
  returns table (id uuid, author_name text, from_team boolean, body text, created_at timestamptz)
  language sql stable security definer
  set search_path = '' as $$
  select m.id,
    coalesce(
      (select c.name from public.deal_counsel c
       where c.deal_id = m.deal_id and c.user_id = m.author_user_id and c.name is not null
       limit 1),
      a.name
    )::text,
    exists (
      select 1 from public.accounts_memberships am
      where am.account_id = m.account_id and am.user_id = m.author_user_id
    ),
    m.body,
    m.created_at
  from public.counsel_message m
  left join public.accounts a on a.id = m.author_user_id and a.is_personal_account
  where m.deal_id = counsel_thread.deal_id
    and m.side = counsel_thread.side
    and (
      public.has_role_on_account(m.account_id)
      or public.is_deal_counsel(counsel_thread.deal_id, counsel_thread.side)
    )
  order by m.created_at, m.id;
$$;

revoke all on function public.counsel_thread(uuid, public.counsel_side) from public, anon;
grant execute on function public.counsel_thread(uuid, public.counsel_side) to authenticated, service_role;

-- ---- Billing lock ----
-- 'members' refuses only the team's own writes; counsel write through the
-- server as non-members.

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.counsel_message
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger same_team_deal_id
  before insert or update on public.counsel_message
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

alter publication supabase_realtime add table public.counsel_message;
