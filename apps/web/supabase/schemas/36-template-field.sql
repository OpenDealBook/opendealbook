-- Merge-field definitions for a document_template. source says where the value
-- comes from (a deal/firm/account column, or manual entry) and source_path is
-- the path into that source. Access is inherited from the owning template.

create table if not exists public.template_field (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.document_template (id) on delete cascade,
  key text not null,
  label text,
  type text check (type in ('text', 'currency', 'date', 'percent', 'list')),
  source text check (source in ('deal', 'firm', 'account', 'manual')),
  source_path text,
  format text,
  required boolean not null default false,
  sort_order int
);

alter table public.template_field enable row level security;

create index ix_template_field_template on public.template_field (template_id);

revoke all on public.template_field from authenticated, service_role;
grant select, insert, update, delete on public.template_field to authenticated;
grant select, insert, update, delete on public.template_field to service_role;

create policy template_field_read on public.template_field
  for select to authenticated
  using (
    exists (
      select 1 from public.document_template t
      where t.id = template_id and public.has_role_on_account(t.account_id)
    )
  );

create policy template_field_insert on public.template_field
  for insert to authenticated
  with check (
    exists (
      select 1 from public.document_template t
      where t.id = template_id
        and public.has_permission((select auth.uid()), t.account_id, 'deals.manage')
    )
  );

create policy template_field_update on public.template_field
  for update to authenticated
  using (
    exists (
      select 1 from public.document_template t
      where t.id = template_id
        and public.has_permission((select auth.uid()), t.account_id, 'deals.manage')
    )
  )
  with check (
    exists (
      select 1 from public.document_template t
      where t.id = template_id
        and public.has_permission((select auth.uid()), t.account_id, 'deals.manage')
    )
  );

create policy template_field_delete on public.template_field
  for delete to authenticated
  using (
    exists (
      select 1 from public.document_template t
      where t.id = template_id
        and public.has_permission((select auth.uid()), t.account_id, 'deals.manage')
    )
  );
