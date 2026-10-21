alter table public.lender_nudge_todo
  alter column todo_id drop not null,
  drop constraint lender_nudge_todo_todo_id_fkey,
  add constraint lender_nudge_todo_todo_id_fkey foreign key (todo_id) references public.personal_todo (id) on delete set null;
