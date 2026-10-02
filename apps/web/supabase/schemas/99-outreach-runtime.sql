-- Cold-outreach runtime state the Temporal dispatcher (packages/workflows
-- outreachDispatch) reads and writes against a PINNED CONTRACT declared in
-- packages/workflows/src/outreach/dispatch.ts. The dispatcher reaches these
-- tables through the service-role admin client with an untyped handle; a Wave-3
-- reconcile regenerates the Database types and drops that cast. The columns here
-- match the pinned row shapes so the swap is mechanical. Two shapes are carried
-- deliberately from the contract: outreach_enrollment.sequence_id is a uuid key
-- into outreach_sequence here while the current dispatcher still resolves it as a
-- string key against DEFAULT_OUTREACH_SEQUENCES, and outreach_message.step_id is
-- the integer ordinal the dispatcher writes from enrollment.current_step, not a
-- foreign key into outreach_step. outreach_message carries no account_id: the
-- dispatcher resolves the account through the parent enrollment, so its RLS joins
-- back through outreach_enrollment the way offer_version joins through offer.

-- Per-account send governor. One row per account, read with maybeSingle by the
-- dispatcher to size the daily batch, so account_id is the primary key.
create table if not exists public.outreach_setting (
  account_id uuid primary key references public.accounts (id) on delete cascade,
  daily_cap int not null,
  max_touches int not null default 1,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users
);

alter table public.outreach_setting enable row level security;

revoke all on public.outreach_setting from authenticated, service_role;
grant select, insert, update, delete on public.outreach_setting to authenticated;
grant select, insert, update, delete on public.outreach_setting to service_role;

create trigger outreach_setting_timestamps
  before insert or update on public.outreach_setting
  for each row execute function public.set_timestamps();

create trigger outreach_setting_user_tracking
  before insert or update on public.outreach_setting
  for each row execute function public.set_user_tracking();

create policy outreach_setting_read on public.outreach_setting
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy outreach_setting_insert on public.outreach_setting
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy outreach_setting_update on public.outreach_setting
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy outreach_setting_delete on public.outreach_setting
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

-- The account's sending mailbox, brokered through Nango. The dispatcher reads one
-- active connection per account with maybeSingle, so account_id is unique; a
-- connection is created and refreshed by the service role from the Nango callback
-- and manageable by the account owner. status gates sending (dispatcher skips any
-- value other than 'active').
create table if not exists public.mailbox_connection (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  user_id uuid not null references auth.users,
  provider text not null check (provider in ('gmail', 'microsoft')),
  nango_connection_id text not null,
  provider_config_key text not null,
  email_address text not null,
  status text not null,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users,
  unique (account_id)
);

alter table public.mailbox_connection enable row level security;

revoke all on public.mailbox_connection from authenticated, service_role;
grant select, insert, update on public.mailbox_connection to authenticated;
grant select, insert, update on public.mailbox_connection to service_role;

create trigger mailbox_connection_timestamps
  before insert or update on public.mailbox_connection
  for each row execute function public.set_timestamps();

create trigger mailbox_connection_user_tracking
  before insert or update on public.mailbox_connection
  for each row execute function public.set_user_tracking();

create policy mailbox_connection_read on public.mailbox_connection
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy mailbox_connection_insert on public.mailbox_connection
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy mailbox_connection_update on public.mailbox_connection
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

-- One target's progress through a sequence. The dispatcher selects queued rows
-- whose next_send_at is due, sends the current step, then advances status and
-- sent_count. firm_id and contact_id are optional sources for the merge context;
-- target_email is the address actually sent to.
create table if not exists public.outreach_enrollment (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  sequence_id uuid not null references public.outreach_sequence (id),
  firm_id uuid references public.firm (id) on delete set null,
  contact_id uuid references public.contact (id) on delete set null,
  target_email text not null,
  status text not null default 'queued'
    check (status in ('queued', 'sent', 'replied', 'stopped', 'suppressed', 'failed')),
  current_step int not null default 1,
  next_send_at timestamptz not null default now(),
  sent_count int not null default 0,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users
);

alter table public.outreach_enrollment enable row level security;

create index ix_outreach_enrollment_due
  on public.outreach_enrollment (account_id, status, next_send_at);

revoke all on public.outreach_enrollment from authenticated, service_role;
grant select, insert, update, delete on public.outreach_enrollment to authenticated;
grant select, insert, update, delete on public.outreach_enrollment to service_role;

create trigger outreach_enrollment_timestamps
  before insert or update on public.outreach_enrollment
  for each row execute function public.set_timestamps();

create trigger outreach_enrollment_user_tracking
  before insert or update on public.outreach_enrollment
  for each row execute function public.set_user_tracking();

create policy outreach_enrollment_read on public.outreach_enrollment
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy outreach_enrollment_insert on public.outreach_enrollment
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy outreach_enrollment_update on public.outreach_enrollment
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy outreach_enrollment_delete on public.outreach_enrollment
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

-- One send attempt against an enrollment, appended by the dispatcher on success
-- and on failure. step_id is the integer ordinal taken from the enrollment's
-- current_step at send time. No account_id: the account is resolved through the
-- parent enrollment, and RLS joins back through it.
create table if not exists public.outreach_message (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.outreach_enrollment (id) on delete cascade,
  step_id int not null,
  to_email text not null,
  subject text not null,
  body text not null,
  status text not null check (status in ('sent', 'failed')),
  provider_message_id text,
  sent_at timestamptz,
  error text
);

alter table public.outreach_message enable row level security;

create index ix_outreach_message_enrollment on public.outreach_message (enrollment_id);
create index ix_outreach_message_to_email on public.outreach_message (to_email);

revoke all on public.outreach_message from authenticated, service_role;
grant select, insert, update on public.outreach_message to authenticated;
grant select, insert, update on public.outreach_message to service_role;

create policy outreach_message_read on public.outreach_message
  for select to authenticated
  using (
    public.has_role_on_account(
      (select e.account_id from public.outreach_enrollment e where e.id = outreach_message.enrollment_id)
    )
  );

create policy outreach_message_insert on public.outreach_message
  for insert to authenticated
  with check (
    public.has_permission(
      (select auth.uid()),
      (select e.account_id from public.outreach_enrollment e where e.id = outreach_message.enrollment_id),
      'deals.manage'
    )
  );

create policy outreach_message_update on public.outreach_message
  for update to authenticated
  using (
    public.has_permission(
      (select auth.uid()),
      (select e.account_id from public.outreach_enrollment e where e.id = outreach_message.enrollment_id),
      'deals.manage'
    )
  )
  with check (
    public.has_permission(
      (select auth.uid()),
      (select e.account_id from public.outreach_enrollment e where e.id = outreach_message.enrollment_id),
      'deals.manage'
    )
  );

-- Addresses the account must never contact again. The dispatcher filters due
-- enrollments against this set; rows arrive from the owner (manual, opt_out) or
-- from the service role on a bounce or reply.
create table if not exists public.outreach_suppression (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  email text not null,
  reason text not null check (reason in ('opt_out', 'bounce', 'manual', 'replied')),
  created_at timestamptz not null default now()
);

alter table public.outreach_suppression enable row level security;

create index ix_outreach_suppression_account_email
  on public.outreach_suppression (account_id, email);

revoke all on public.outreach_suppression from authenticated, service_role;
grant select, insert, update, delete on public.outreach_suppression to authenticated;
grant select, insert, update, delete on public.outreach_suppression to service_role;

create policy outreach_suppression_read on public.outreach_suppression
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy outreach_suppression_insert on public.outreach_suppression
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy outreach_suppression_update on public.outreach_suppression
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy outreach_suppression_delete on public.outreach_suppression
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));
