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
    coalesce(dc.name, dc.email) || ', ' || split_part(m.name, ' ', 1) || '''s counsel',
    c.created_at
  from public.seller_room_comment c
  join public.seller_room r on r.id = c.room_id
  join public.deal_counsel dc on dc.deal_id = r.deal_id and dc.user_id = c.author_user_id
  join public.seller_room_member m on m.room_id = r.id and m.user_id = dc.invited_by
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

create or replace function public.refuse_sharing_counsel_folder_to_seller()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  if exists (
    with recursive ancestry as (
      select f.id, f.parent_id from public.dr_folder f where f.id = new.dr_folder_id
      union all
      select p.id, p.parent_id from public.dr_folder p join ancestry a on p.id = a.parent_id
    )
    select 1 from ancestry a
    where a.id in (select u.folder_id from public.counsel_uploads_folder u)
      or a.id in (select s.folder_id from public.seller_counsel_folder s)
  ) then
    raise exception 'Counsel folders cannot be shown to sellers.'
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

create or replace function public.refuse_moving_counsel_folder_to_seller()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  if exists (
    with recursive shared_above as (
      select f.id, f.parent_id from public.dr_folder f where f.id = new.parent_id
      union all
      select p.id, p.parent_id from public.dr_folder p join shared_above a on p.id = a.parent_id
    )
    select 1 from shared_above a
    where a.id in (select sf.dr_folder_id from public.seller_room_folder sf)
      or a.id in (select r.uploads_folder_id from public.seller_room r)
  ) and exists (
    with recursive counsel_above as (
      select f.id, f.parent_id from public.dr_folder f where f.id = old.parent_id
      union all
      select p.id, p.parent_id from public.dr_folder p join counsel_above a on p.id = a.parent_id
    ),
    counsel_below as (
      select new.id as id
      union all
      select c.id from public.dr_folder c join counsel_below b on c.parent_id = b.id
    )
    select 1 from (select id from counsel_above union all select id from counsel_below) t
    where t.id in (select u.folder_id from public.counsel_uploads_folder u)
      or t.id in (select s.folder_id from public.seller_counsel_folder s)
  ) then
    raise exception 'Counsel folders cannot be shown to sellers.'
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

with made as (
  insert into public.dr_folder (account_id, deal_id, parent_id, name)
  select distinct on (c.deal_id) c.account_id, c.deal_id, null, 'Seller''s counsel'
  from public.deal_counsel c
  where c.side = 'seller'
  returning id, account_id, deal_id
)
insert into public.seller_counsel_folder (deal_id, account_id, folder_id)
select deal_id, account_id, id from made;
