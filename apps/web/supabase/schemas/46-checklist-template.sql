-- Reusable diligence checklist templates. A template holds ordered items that
-- are copied into a deal's checklist_item rows when applied. Account-scoped;
-- managed with checklists.manage. Items inherit access from their template.

create table if not exists public.checklist_template (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  name text not null,
  category text,
  created_by uuid references auth.users default auth.uid(),
  created_at timestamptz,
  updated_at timestamptz
);

alter table public.checklist_template enable row level security;

create index ix_checklist_template_account on public.checklist_template (account_id);

revoke all on public.checklist_template from authenticated, service_role;
grant select, insert, update, delete on public.checklist_template to authenticated;
grant select, insert, update, delete on public.checklist_template to service_role;

create trigger checklist_template_timestamps
  before insert or update on public.checklist_template
  for each row execute function public.set_timestamps();

create policy checklist_template_read on public.checklist_template
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy checklist_template_insert on public.checklist_template
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'checklists.manage'));

create policy checklist_template_update on public.checklist_template
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'checklists.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'checklists.manage'));

create policy checklist_template_delete on public.checklist_template
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'checklists.manage'));

create table if not exists public.checklist_template_item (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.checklist_template (id) on delete cascade,
  category text,
  title varchar(500) not null,
  priority int not null default 0,
  deal_killer boolean not null default false,
  due_offset_days int,
  sort_order int not null default 0
);

alter table public.checklist_template_item enable row level security;

create index ix_checklist_template_item_template on public.checklist_template_item (template_id);

revoke all on public.checklist_template_item from authenticated, service_role;
grant select, insert, update, delete on public.checklist_template_item to authenticated;
grant select, insert, update, delete on public.checklist_template_item to service_role;

create policy checklist_template_item_read on public.checklist_template_item
  for select to authenticated
  using (
    exists (
      select 1 from public.checklist_template t
      where t.id = template_id and public.has_role_on_account(t.account_id)
    )
  );

create policy checklist_template_item_insert on public.checklist_template_item
  for insert to authenticated
  with check (
    exists (
      select 1 from public.checklist_template t
      where t.id = template_id
        and public.has_permission((select auth.uid()), t.account_id, 'checklists.manage')
    )
  );

create policy checklist_template_item_update on public.checklist_template_item
  for update to authenticated
  using (
    exists (
      select 1 from public.checklist_template t
      where t.id = template_id
        and public.has_permission((select auth.uid()), t.account_id, 'checklists.manage')
    )
  )
  with check (
    exists (
      select 1 from public.checklist_template t
      where t.id = template_id
        and public.has_permission((select auth.uid()), t.account_id, 'checklists.manage')
    )
  );

create policy checklist_template_item_delete on public.checklist_template_item
  for delete to authenticated
  using (
    exists (
      select 1 from public.checklist_template t
      where t.id = template_id
        and public.has_permission((select auth.uid()), t.account_id, 'checklists.manage')
    )
  );
