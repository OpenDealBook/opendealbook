-- Marketing lead capture from the public OpenDealbook site. The contact form is
-- served to anonymous, pre-auth visitors, so rows are written only by the
-- service-role client from inside the contact server action; there is no insert
-- grant to anon or authenticated, which keeps the form off any direct client
-- insert path. Leads belong to the OpenDealbook vendor team, not to a tenant, so
-- there is no account_id and the row is platform-level. A verified super admin
-- may read it; no one updates or deletes it except the service role.

create table if not exists public.lead (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text not null,
  company text,
  message text,
  source text,
  created_at timestamptz not null default now()
);

alter table public.lead enable row level security;

create index ix_lead_created_at on public.lead (created_at desc);
create index ix_lead_email on public.lead (email);

revoke all on public.lead from authenticated, service_role;
grant select on public.lead to authenticated;
grant insert on public.lead to service_role;

create policy lead_read on public.lead
  for select to authenticated
  using (public.is_super_admin());
