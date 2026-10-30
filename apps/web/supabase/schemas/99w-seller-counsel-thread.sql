-- A private thread between the seller side of a deal: the seller room's
-- sellers and seller's counsel. Nobody on the buyer side reads it, not even
-- the team that owns the deal. Its files live in their own bucket and never
-- in the data room.

create type public.seller_counsel_author_side as enum ('seller', 'counsel');

create table if not exists public.seller_counsel_message (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid not null references public.deal (id) on delete cascade,
  author_user_id uuid references auth.users on delete set null,
  author_side public.seller_counsel_author_side not null,
  author_name text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists ix_seller_counsel_message_deal on public.seller_counsel_message (deal_id, created_at);

create table if not exists public.seller_counsel_message_file (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid not null references public.deal (id) on delete cascade,
  message_id uuid not null references public.seller_counsel_message (id) on delete cascade,
  name text not null,
  storage_path text not null unique
);

create index if not exists ix_seller_counsel_message_file_message on public.seller_counsel_message_file (message_id);

alter table public.seller_counsel_message enable row level security;
alter table public.seller_counsel_message_file enable row level security;

revoke all on public.seller_counsel_message from anon, authenticated, service_role;
revoke all on public.seller_counsel_message_file from anon, authenticated, service_role;
grant select on public.seller_counsel_message to authenticated;
grant select on public.seller_counsel_message_file to authenticated;
grant select, insert, update, delete on public.seller_counsel_message to service_role;
grant select, insert, update, delete on public.seller_counsel_message_file to service_role;

create policy seller_counsel_message_read on public.seller_counsel_message
  for select to authenticated
  using (public.is_deal_seller_side(deal_id));

create policy seller_counsel_message_file_read on public.seller_counsel_message_file
  for select to authenticated
  using (public.is_deal_seller_side(deal_id));

alter publication supabase_realtime add table public.seller_counsel_message;

insert into storage.buckets (id, name, public, file_size_limit)
values ('seller-counsel-thread', 'seller-counsel-thread', false, 314572800)
on conflict (id) do nothing;

-- Objects are keyed <deal_id>/...
create policy seller_counsel_thread_objects_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'seller-counsel-thread'
    and public.is_deal_seller_side(((storage.foldername(name))[1])::uuid)
  );


-- The seller side keep reading once the room closes or the deal ends; nobody
-- on it writes. The buyer side get no reason.
create or replace function public.seller_side_read_only_reason(deal_id uuid)
  returns text
  language sql stable security definer
  set search_path = '' as $$
  select case
    when d.archived_at is not null or d.resolution is not null
      then 'This deal has closed, so everything here is read-only.'
    when r.closed_at is not null
      then 'The seller room is closed, so this is read-only.'
  end
  from public.deal d
  join public.seller_room r on r.deal_id = d.id
  where d.id = seller_side_read_only_reason.deal_id
    and public.is_deal_seller_side(d.id);
$$;

revoke all on function public.seller_side_read_only_reason(uuid) from public, anon;
grant execute on function public.seller_side_read_only_reason(uuid) to authenticated, service_role;

create policy seller_counsel_thread_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'seller-counsel-thread'
    and public.is_deal_seller_side(((storage.foldername(name))[1])::uuid)
    and public.seller_side_read_only_reason(((storage.foldername(name))[1])::uuid) is null
  );

-- Posting names the author from the side they are on, and attaches only files
-- the author uploaded for this deal, each named by its stored object.
create or replace function public.post_seller_counsel_message(deal_id uuid, body text, files jsonb default '[]')
  returns uuid
  language plpgsql security definer
  set search_path = '' as $$
declare
  author_side public.seller_counsel_author_side;
  author_name text;
  read_only_reason text := public.seller_side_read_only_reason(post_seller_counsel_message.deal_id);
  message_id uuid;
begin
  if read_only_reason is not null then
    raise exception '%', read_only_reason;
  end if;

  if length(body) > 10000 then
    raise exception 'A message can be at most 10,000 characters.';
  end if;

  if jsonb_array_length(files) > 20 then
    raise exception 'Attach at most 20 files to one message.';
  end if;

  select 'seller', m.name into author_side, author_name
  from public.seller_room_member m
  join public.seller_room r on r.id = m.room_id
  where r.deal_id = post_seller_counsel_message.deal_id and m.user_id = (select auth.uid());

  if author_side is null and public.is_deal_counsel(post_seller_counsel_message.deal_id, 'seller') then
    select 'counsel', coalesce(c.name, c.email) into author_side, author_name
    from public.deal_counsel c
    where c.deal_id = post_seller_counsel_message.deal_id and c.side = 'seller' and c.user_id = (select auth.uid());
  end if;

  if author_side is null then
    raise exception 'only the seller side post in this thread' using errcode = 'insufficient_privilege';
  end if;

  if exists (
    select 1 from jsonb_array_elements(files) f
    where not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'seller-counsel-thread'
        and o.name = f ->> 'path'
        and o.owner_id = (select auth.uid())::text
        and (storage.foldername(o.name))[1] = post_seller_counsel_message.deal_id::text
    )
  ) then
    raise exception 'a file can be attached only by the person who uploaded it' using errcode = 'insufficient_privilege';
  end if;

  insert into public.seller_counsel_message (account_id, deal_id, author_user_id, author_side, author_name, body)
  select d.account_id, d.id, (select auth.uid()), author_side, author_name, post_seller_counsel_message.body
  from public.deal d where d.id = post_seller_counsel_message.deal_id
  returning id into message_id;

  insert into public.seller_counsel_message_file (account_id, deal_id, message_id, name, storage_path)
  select d.account_id, d.id, message_id, regexp_replace(f ->> 'path', '^.*/', ''), f ->> 'path'
  from public.deal d, jsonb_array_elements(files) f
  where d.id = post_seller_counsel_message.deal_id;

  return message_id;
end;
$$;

revoke all on function public.post_seller_counsel_message(uuid, text, jsonb) from public, anon;
grant execute on function public.post_seller_counsel_message(uuid, text, jsonb) to authenticated, service_role;

create policy seller_room_question_message_seller_read_only on public.seller_room_question_message
  as restrictive for insert to authenticated
  with check (
    side <> 'seller'
    or exists (
      select 1 from public.seller_room_question q
      join public.seller_room r on r.id = q.room_id
      where q.id = seller_room_question_message.question_id
        and public.seller_side_read_only_reason(r.deal_id) is null
    )
  );

create policy seller_room_question_file_seller_read_only on public.seller_room_question_file
  as restrictive for insert to authenticated
  with check (
    side <> 'seller'
    or exists (
      select 1 from public.seller_room_question q
      join public.seller_room r on r.id = q.room_id
      where q.id = seller_room_question_file.question_id
        and public.seller_side_read_only_reason(r.deal_id) is null
    )
  );

create policy seller_room_comment_read_only on public.seller_room_comment
  as restrictive for insert to authenticated
  with check (
    public.seller_side_read_only_reason((select r.deal_id from public.seller_room r where r.id = room_id)) is null
  );

create policy deal_counsel_seller_read_only on public.deal_counsel
  as restrictive for delete to authenticated
  using (side <> 'seller' or public.seller_side_read_only_reason(deal_id) is null);

-- Each post is recorded in the deal history for the email relay, which the
-- buyer side never read.
create policy deal_event_seller_counsel_thread_kept on public.deal_event
  as restrictive for select to authenticated
  using (aggregate_type <> 'seller_counsel_message');

create policy deal_event_snapshot_seller_counsel_thread_kept on public.deal_event_snapshot
  as restrictive for select to authenticated
  using (aggregate_type <> 'seller_counsel_message');

-- ---- Billing lock and team-only rows ----
-- 'members' refuses only the team's own writes; the seller side are never
-- members.

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.seller_counsel_message
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.seller_counsel_message_file
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger same_team_deal_id
  before insert or update on public.seller_counsel_message
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_deal_id
  before insert or update on public.seller_counsel_message_file
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_message_id
  before insert or update on public.seller_counsel_message_file
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'message_id', 'seller_counsel_message');

create trigger refuse_personal_account_row
  before insert or update of account_id on public.seller_counsel_message
  for each row execute function odb.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.seller_counsel_message_file
  for each row execute function odb.refuse_personal_account_row();
