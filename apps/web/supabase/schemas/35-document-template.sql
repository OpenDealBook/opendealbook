-- Account-scoped document templates (the .docx lives at docx_path in storage).
-- Managed with deals.manage. Field definitions live in template_field.

create table if not exists public.document_template (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  name text not null,
  type text not null check (type in ('nda', 'loi', 'apa', 'data_request', 'letter')),
  docx_path text,
  version int not null default 1,
  created_by uuid references auth.users default auth.uid(),
  created_at timestamptz,
  updated_at timestamptz
);

alter table public.document_template enable row level security;

create index ix_document_template_account on public.document_template (account_id);

revoke all on public.document_template from authenticated, service_role;
grant select, insert, update, delete on public.document_template to authenticated;
grant select, insert, update, delete on public.document_template to service_role;

create trigger document_template_timestamps
  before insert or update on public.document_template
  for each row execute function public.set_timestamps();

create policy document_template_read on public.document_template
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy document_template_insert on public.document_template
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy document_template_update on public.document_template
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy document_template_delete on public.document_template
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));
