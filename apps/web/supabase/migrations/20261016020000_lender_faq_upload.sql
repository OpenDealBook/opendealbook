create table if not exists public.lender_faq_upload (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null,
  deal_id uuid not null,
  name text not null,
  storage_path text not null unique,
  uploaded_by uuid not null references auth.users,
  created_at timestamptz not null default now(),
  registered_at timestamptz,
  foreign key (entry_id, deal_id) references public.lender_faq_entry (id, deal_id) on delete cascade,
  check (
    starts_with(storage_path, 'deal/' || deal_id || '/')
    and storage_path !~ '\\|(^|/)\.{0,2}(/|$)'
  )
);

alter table public.lender_faq_upload enable row level security;

revoke all on public.lender_faq_upload from anon, authenticated, service_role;
grant select on public.lender_faq_upload to authenticated;
grant select, insert, update, delete on public.lender_faq_upload to service_role;

create policy lender_faq_upload_read on public.lender_faq_upload
  for select to authenticated
  using (
    exists (
      select 1 from public.lender_faq_entry e
      where e.id = lender_faq_upload.entry_id
        and public.manages_deal_in_account(e.deal_id, e.account_id)
    )
  );

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.lender_faq_upload
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'deal_id', 'deal');

create trigger same_team_deal_id
  before insert or update on public.lender_faq_entry
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_ask_id
  before insert or update on public.lender_faq_source
  for each row execute function tuckin.refuse_cross_team_link('entry_id', 'lender_faq_entry', 'ask_id', 'lender_ask');
