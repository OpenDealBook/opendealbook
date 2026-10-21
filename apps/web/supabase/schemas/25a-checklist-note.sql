-- The notes thread on a checklist item. Append-only: a note is projected from
-- its checklist_item.note_posted event and never edited or deleted. Whoever
-- reads the item reads its notes.

create table if not exists public.checklist_item_note (
  id uuid primary key,
  checklist_item_id uuid not null references public.checklist_item (id) on delete cascade,
  body text not null,
  author_user_id uuid references auth.users,
  created_at timestamptz not null
);

alter table public.checklist_item_note enable row level security;

create index ix_checklist_item_note_item on public.checklist_item_note (checklist_item_id, created_at);

revoke all on public.checklist_item_note from authenticated, service_role;
grant select on public.checklist_item_note to authenticated;
grant select on public.checklist_item_note to service_role;

create policy checklist_item_note_read on public.checklist_item_note
  for select to authenticated
  using (exists (select 1 from public.checklist_item i where i.id = checklist_item_id));
