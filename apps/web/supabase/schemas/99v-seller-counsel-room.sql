-- Seller's counsel in the seller room: they read it as the seller does,
-- comment on its files and question threads for the seller and the team to
-- see, and never answer a question themselves. Their deal also gets a
-- "Seller's counsel" root folder, kept from the seller room like the buyer's.

create table if not exists public.seller_room_comment (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null,
  account_id uuid not null,
  dr_document_id uuid,
  question_id uuid references public.seller_room_question (id) on delete cascade,
  author_user_id uuid not null references auth.users default auth.uid(),
  body text not null,
  created_at timestamptz not null default now(),
  foreign key (room_id, account_id) references public.seller_room (id, account_id) on delete cascade,
  constraint seller_room_comment_one_subject check (num_nonnulls(dr_document_id, question_id) = 1)
);

create index if not exists ix_seller_room_comment_room on public.seller_room_comment (room_id);

alter table public.seller_room_comment enable row level security;

revoke all on public.seller_room_comment from anon, authenticated, service_role;
grant select, insert on public.seller_room_comment to authenticated;
grant select, insert, update, delete on public.seller_room_comment to service_role;

create policy seller_room_comment_read on public.seller_room_comment
  for select to authenticated
  using (public.can_manage_seller_room(room_id) or public.is_seller_room_member(room_id));

create policy seller_room_comment_insert on public.seller_room_comment
  for insert to authenticated
  with check (
    author_user_id = (select auth.uid())
    and public.is_seller_room_member(room_id)
    and public.is_deal_counsel((select r.deal_id from public.seller_room r where r.id = room_id), 'seller')
    and (
      public.seller_room_shows_document(room_id, dr_document_id)
      or exists (
        select 1 from public.seller_room_question q
        where q.id = seller_room_comment.question_id and q.room_id = seller_room_comment.room_id
      )
    )
  );

create or replace function public.seller_room_comments(room_id uuid)
  returns table (
    id uuid,
    dr_document_id uuid,
    question_id uuid,
    body text,
    author text,
    created_at timestamptz
  )
  language sql stable security definer
  set search_path = '' as $$
  select c.id, c.dr_document_id, c.question_id, c.body,
    coalesce(dc.name, dc.email) || ', '
      || coalesce(nullif(split_part(btrim(m.name), ' ', 1), '') || '''s', 'the seller''s') || ' counsel',
    c.created_at
  from public.seller_room_comment c
  join public.seller_room r on r.id = c.room_id
  join public.deal_counsel dc on dc.deal_id = r.deal_id and dc.user_id = c.author_user_id
  left join public.seller_room_member m on m.room_id = r.id and m.user_id = dc.invited_by
  where c.room_id = seller_room_comments.room_id
    and (public.can_manage_seller_room(r.id) or public.is_seller_room_member(r.id))
  order by c.created_at;
$$;

revoke all on function public.seller_room_comments(uuid) from public, anon;
grant execute on function public.seller_room_comments(uuid) to authenticated, service_role;

-- The answer stays the seller's: a seller-side answer or answer file needs a
-- member row, which seller's counsel never have.
create policy seller_room_question_message_seller_answers on public.seller_room_question_message
  as restrictive for insert to authenticated
  with check (
    side <> 'seller'
    or exists (
      select 1 from public.seller_room_question q
      join public.seller_room_member m on m.room_id = q.room_id
      where q.id = seller_room_question_message.question_id and m.user_id = (select auth.uid())
    )
  );

create policy seller_room_question_file_seller_answers on public.seller_room_question_file
  as restrictive for insert to authenticated
  with check (
    side <> 'seller'
    or exists (
      select 1 from public.seller_room_question q
      join public.seller_room_member m on m.room_id = q.room_id
      where q.id = seller_room_question_file.question_id and m.user_id = (select auth.uid())
    )
  );

-- ---- The "Seller's counsel" folder ----

create table if not exists public.seller_counsel_folder (
  deal_id uuid primary key references public.deal (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  folder_id uuid not null references public.dr_folder (id) on delete cascade
);

alter table public.seller_counsel_folder enable row level security;

revoke all on public.seller_counsel_folder from anon, authenticated, service_role;
grant select, insert, update, delete on public.seller_counsel_folder to service_role;

create or replace function public.make_seller_counsel_folder()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
declare
  folder uuid;
begin
  if exists (select 1 from public.seller_counsel_folder s where s.deal_id = new.deal_id) then
    return new;
  end if;

  insert into public.dr_folder (account_id, deal_id, parent_id, name)
  values (new.account_id, new.deal_id, null, 'Seller''s counsel')
  returning id into folder;

  insert into public.seller_counsel_folder (deal_id, account_id, folder_id)
  values (new.deal_id, new.account_id, folder);

  return new;
end;
$$;

create trigger seller_counsel_folder_made
  after insert on public.deal_counsel
  for each row when (new.side = 'seller')
  execute function public.make_seller_counsel_folder();

-- Deleting the deal still takes the folder with it.
create or replace function public.refuse_deleting_seller_counsel_folder()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  if exists (select 1 from public.seller_counsel_folder s where s.folder_id = old.id)
    and exists (select 1 from public.deal d where d.id = old.deal_id) then
    raise exception 'This folder holds seller''s counsel files and cannot be deleted'
      using errcode = 'restrict_violation';
  end if;
  return old;
end;
$$;

create trigger seller_counsel_folder_kept
  before delete on public.dr_folder
  for each row execute function public.refuse_deleting_seller_counsel_folder();

-- Only the seller side read the Seller's counsel folder, everything below it
-- and its files: the seller room's sellers and seller's counsel. The buyer
-- team and buyer's counsel never do; files reach the buyer only when counsel
-- upload them into the seller room.
-- Seller's counsel keep reading for a year from the day the deal ended,
-- archived or resolved, whichever came first. Only they learn the date.
create or replace function tuckin.seller_counsel_window_end(deal_id uuid)
  returns timestamptz
  language sql stable
  set search_path = '' as $$
  select least(
      d.archived_at,
      case when d.resolution is not null then coalesce(
        (select max(e.created_at) from public.deal_event e
         where e.deal_id = d.id and e.event_type = 'deal.resolved'),
        d.updated_at
      ) end
    ) + interval '1 year'
  from public.deal d
  where d.id = seller_counsel_window_end.deal_id;
$$;

revoke all on function tuckin.seller_counsel_window_end(uuid) from public, anon, authenticated, service_role;

create or replace function public.seller_counsel_read_until(deal_id uuid)
  returns timestamptz
  language sql stable security definer
  set search_path = '' as $$
  select tuckin.seller_counsel_window_end(seller_counsel_read_until.deal_id)
  where exists (
    select 1 from public.deal_counsel c
    where c.deal_id = seller_counsel_read_until.deal_id and c.side = 'seller' and c.user_id = (select auth.uid())
  );
$$;

revoke all on function public.seller_counsel_read_until(uuid) from public, anon;
grant execute on function public.seller_counsel_read_until(uuid) to authenticated, service_role;

-- is_deal_counsel still ends everything they can change.
create or replace function public.is_deal_seller_counsel_reader(deal_id uuid)
  returns boolean
  language sql stable security definer
  set search_path = '' as $$
  select exists (
    select 1 from public.deal_counsel c
    where c.deal_id = is_deal_seller_counsel_reader.deal_id
      and c.side = 'seller'
      and c.user_id = (select auth.uid())
  )
  and coalesce(now() < public.seller_counsel_read_until(is_deal_seller_counsel_reader.deal_id), true);
$$;

revoke all on function public.is_deal_seller_counsel_reader(uuid) from public, anon;
grant execute on function public.is_deal_seller_counsel_reader(uuid) to authenticated, service_role;

create or replace function public.is_deal_seller_side(deal_id uuid)
  returns boolean
  language sql stable security definer
  set search_path = '' as $$
  select public.is_deal_seller_room_member(is_deal_seller_side.deal_id)
    or public.is_deal_seller_counsel_reader(is_deal_seller_side.deal_id);
$$;

revoke all on function public.is_deal_seller_side(uuid) from public, anon;
grant execute on function public.is_deal_seller_side(uuid) to authenticated, service_role;

-- The caller's own: only the deals they are on the seller side of.
create or replace function public.seller_counsel_folder_ids()
  returns uuid[]
  language sql stable security definer
  set search_path = '' as $$
  with recursive below as (
    select s.folder_id as id from public.seller_counsel_folder s
    where public.is_deal_seller_side(s.deal_id)
    union all
    select f.id from public.dr_folder f join below b on f.parent_id = b.id
  )
  select coalesce(array_agg(below.id), '{}') from below;
$$;

revoke all on function public.seller_counsel_folder_ids() from public, anon;
grant execute on function public.seller_counsel_folder_ids() to authenticated, service_role;

create or replace function public.is_seller_counsel_folder(folder_id uuid)
  returns boolean
  language sql stable security definer
  set search_path = '' as $$
  with recursive above as (
    select f.id, f.parent_id from public.dr_folder f where f.id = is_seller_counsel_folder.folder_id
    union all
    select f.id, f.parent_id from public.dr_folder f join above a on f.id = a.parent_id
  )
  select exists (select 1 from above a join public.seller_counsel_folder s on s.folder_id = a.id);
$$;

revoke all on function public.is_seller_counsel_folder(uuid) from public, anon;
grant execute on function public.is_seller_counsel_folder(uuid) to authenticated, service_role;

create or replace function public.is_seller_counsel_document(document_id uuid)
  returns boolean
  language sql stable security definer
  set search_path = '' as $$
  select exists (
    select 1 from public.dr_document d
    where d.id = is_seller_counsel_document.document_id and public.is_seller_counsel_folder(d.folder_id)
  );
$$;

revoke all on function public.is_seller_counsel_document(uuid) from public, anon;
grant execute on function public.is_seller_counsel_document(uuid) to authenticated, service_role;

create index if not exists ix_dr_document_storage_path on public.dr_document (storage_path);

create or replace function public.is_seller_counsel_object(name text)
  returns boolean
  language sql stable security definer
  set search_path = '' as $$
  select exists (
    select 1 from public.dr_document d
    where d.storage_path = regexp_replace(is_seller_counsel_object.name, '\.preview\.[a-z]+$', '')
      and public.is_seller_counsel_folder(d.folder_id)
  );
$$;

revoke all on function public.is_seller_counsel_object(text) from public, anon;
grant execute on function public.is_seller_counsel_object(text) to authenticated, service_role;

create policy dr_folder_seller_counsel_kept on public.dr_folder
  as restrictive for select to authenticated
  using (not public.is_seller_counsel_folder(id) or public.is_deal_seller_side(deal_id));

create policy dr_folder_seller_counsel_read on public.dr_folder
  for select to authenticated
  using (id = any ((select public.seller_counsel_folder_ids())::uuid[]));

create policy dr_document_seller_counsel_kept on public.dr_document
  as restrictive for select to authenticated
  using (not public.is_seller_counsel_folder(folder_id) or public.is_deal_seller_side(deal_id));

create policy dr_document_seller_counsel_read on public.dr_document
  for select to authenticated
  using (
    removed_at is null
    and folder_id = any ((select public.seller_counsel_folder_ids())::uuid[])
  );

-- Its files never reach a buyer-side read: not the deal history the team
-- reads, not the stored objects, previews included, and not their indexed
-- text, indexing jobs or verification findings. The seller side open them
-- only through signed links the server makes.
create policy deal_event_seller_counsel_kept on public.deal_event
  as restrictive for select to authenticated
  using (aggregate_type <> 'dr_document' or not public.is_seller_counsel_document(aggregate_id));

create policy deal_event_snapshot_seller_counsel_kept on public.deal_event_snapshot
  as restrictive for select to authenticated
  using (aggregate_type <> 'dr_document' or not public.is_seller_counsel_document(aggregate_id));

create policy data_room_objects_seller_counsel_kept on storage.objects
  as restrictive for select to authenticated
  using (bucket_id <> 'data-room' or not public.is_seller_counsel_object(name));

create policy document_chunk_seller_counsel_kept on public.document_chunk
  as restrictive for select to authenticated
  using (not public.is_seller_counsel_document(document_id));

create policy embedding_job_seller_counsel_kept on public.embedding_job
  as restrictive for select to authenticated
  using (not public.is_seller_counsel_document(dr_document_id));

create policy verification_finding_seller_counsel_kept on public.verification_finding
  as restrictive for select to authenticated
  using (not public.is_seller_counsel_document(dr_document_id));

-- ---- Billing lock ----

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.seller_room_comment
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger same_team_question_id
  before insert or update on public.seller_room_comment
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'question_id', 'seller_room_question');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.seller_counsel_folder
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger same_team_deal_id
  before insert or update on public.seller_counsel_folder
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_folder_id
  before insert or update on public.seller_counsel_folder
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'folder_id', 'dr_folder');

create trigger refuse_personal_account_row
  before insert or update of account_id on public.seller_room_comment
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.seller_counsel_folder
  for each row execute function tuckin.refuse_personal_account_row();

alter publication supabase_realtime add table public.seller_room_comment;
