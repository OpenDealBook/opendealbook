-- One to-do per contract version, side and teammate, made by the hourly sync
-- while that side has not answered the latest review request, and cleared once
-- it has or the version is no longer current. The link names the request and
-- the stage it was made for: 'share' while the seller side cannot yet see the
-- version, 'waiting' once they can. A to-do deleted by hand leaves its link
-- with a null todo_id, so it is not made again for that request and stage.
-- Service role only.
create table if not exists public.contract_review_todo (
  contract_version_id uuid not null references public.contract_version (id) on delete cascade,
  side public.counsel_side not null,
  user_id uuid not null references auth.users on delete cascade,
  request_id uuid not null references public.contract_review_request (id) on delete cascade,
  stage text not null check (stage in ('share', 'waiting')),
  todo_id uuid references public.personal_todo (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (contract_version_id, side, user_id)
);

alter table public.contract_review_todo enable row level security;

revoke all on public.contract_review_todo from anon, authenticated, service_role;
grant select, insert, delete on public.contract_review_todo to service_role;

insert into tuckin.billing_lock_exempt_tables (table_name, reason) values
  ('contract_review_todo', 'service-role only, links a teammate''s waiting-on-counsel to-do to a version')
on conflict (table_name) do update set reason = excluded.reason;
