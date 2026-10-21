-- Buyer's counsel and the data room files: what they open, tracked for the
-- team as lender opens are, and what they upload, into one "Buyer's counsel"
-- root folder per deal. Every write is made by server code with the service
-- role, after it has checked the caller.

create type public.counsel_activity_action as enum ('document_previewed', 'document_downloaded');

-- No foreign key on dr_document_id: replay_deal deletes a deal's documents
-- and puts them back under the same ids.
create table if not exists public.counsel_activity (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid not null references public.deal (id) on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  action public.counsel_activity_action not null,
  dr_document_id uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists ix_counsel_activity_deal on public.counsel_activity (deal_id);

alter table public.counsel_activity enable row level security;

revoke all on public.counsel_activity from anon, authenticated, service_role;
grant select on public.counsel_activity to authenticated;
grant select, insert, update, delete on public.counsel_activity to service_role;

create policy counsel_activity_read on public.counsel_activity
  for select to authenticated
  using (public.manages_deal_in_account(deal_id, account_id));

create table if not exists public.counsel_uploads_folder (
  deal_id uuid primary key references public.deal (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  folder_id uuid not null references public.dr_folder (id) on delete cascade
);

alter table public.counsel_uploads_folder enable row level security;

revoke all on public.counsel_uploads_folder from anon, authenticated, service_role;
grant select, insert, update, delete on public.counsel_uploads_folder to service_role;

-- Registering reads the storage key from this row, never from the caller.
create table if not exists public.counsel_upload (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deal (id) on delete cascade,
  folder_id uuid not null references public.dr_folder (id) on delete cascade,
  name text not null,
  storage_path text not null unique,
  keep_as_zip boolean,
  uploaded_by uuid not null references auth.users,
  created_at timestamptz not null default now(),
  registered_at timestamptz,
  document_ids uuid[]
);

alter table public.counsel_upload enable row level security;

revoke all on public.counsel_upload from anon, authenticated, service_role;
grant select, insert, update, delete on public.counsel_upload to service_role;

-- Two first uploads racing make one folder: the loser drops its own.
create or replace function public.ensure_counsel_uploads_folder(deal_id uuid)
  returns uuid
  language plpgsql security definer
  set search_path = '' as $$
declare
  deal_account uuid;
  folder uuid;
begin
  select u.folder_id into folder
  from public.counsel_uploads_folder u
  where u.deal_id = ensure_counsel_uploads_folder.deal_id;

  if folder is not null then
    return folder;
  end if;

  select d.account_id into strict deal_account
  from public.deal d where d.id = ensure_counsel_uploads_folder.deal_id;

  insert into public.dr_folder (account_id, deal_id, parent_id, name)
  values (deal_account, ensure_counsel_uploads_folder.deal_id, null, 'Buyer''s counsel')
  returning id into folder;

  insert into public.counsel_uploads_folder (deal_id, account_id, folder_id)
  values (ensure_counsel_uploads_folder.deal_id, deal_account, folder)
  on conflict on constraint counsel_uploads_folder_pkey do nothing;

  if not found then
    delete from public.dr_folder where id = folder;
    select u.folder_id into folder
    from public.counsel_uploads_folder u
    where u.deal_id = ensure_counsel_uploads_folder.deal_id;
  end if;

  return folder;
end;
$$;

revoke all on function public.ensure_counsel_uploads_folder(uuid) from public, anon, authenticated;
grant execute on function public.ensure_counsel_uploads_folder(uuid) to service_role;

create or replace function public.buyer_counsel_seller_question_files(deal_id uuid)
  returns table (question_id uuid, dr_document_id uuid, name text)
  language sql stable security definer
  set search_path = '' as $$
  select f.question_id, f.dr_document_id, d.name
  from public.seller_room_question_file f
  join public.seller_room_question q on q.id = f.question_id
  join public.seller_room r on r.id = q.room_id
  join public.buyer_counsel_documents(buyer_counsel_seller_question_files.deal_id) d on d.id = f.dr_document_id
  where r.deal_id = buyer_counsel_seller_question_files.deal_id
  order by f.created_at;
$$;

revoke all on function public.buyer_counsel_seller_question_files(uuid) from public, anon;
grant execute on function public.buyer_counsel_seller_question_files(uuid) to authenticated, service_role;

-- ---- Billing lock ----
-- 'members' refuses only the team's own writes. Counsel uploads stop while
-- the team is locked, which the server checks before it writes here.

insert into tuckin.billing_lock_exempt_tables (table_name, reason) values
  ('counsel_activity', 'recorded when counsel open files')
on conflict (table_name) do update set reason = excluded.reason;

create trigger refuse_team_move
  before update on public.counsel_activity
  for each row execute function tuckin.refuse_team_move();

create trigger same_team_deal_id
  before insert or update on public.counsel_activity
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.counsel_uploads_folder
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger same_team_deal_id
  before insert or update on public.counsel_uploads_folder
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_folder_id
  before insert or update on public.counsel_uploads_folder
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'folder_id', 'dr_folder');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.counsel_upload
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'deal_id', 'deal');

create trigger same_team_folder_id
  before insert or update on public.counsel_upload
  for each row execute function tuckin.refuse_cross_team_link('deal_id', 'deal', 'folder_id', 'dr_folder');
