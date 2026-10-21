alter table public.personal_todo
  drop constraint personal_todo_user_id_fkey,
  add constraint personal_todo_user_id_fkey foreign key (user_id) references auth.users on delete cascade;

alter table public.personal_todo
  drop constraint personal_todo_created_by_fkey,
  add constraint personal_todo_created_by_fkey foreign key (created_by) references auth.users on delete set null;

drop trigger personal_todo_user_tracking on public.personal_todo;

create trigger personal_todo_user_tracking
  before insert or update on public.personal_todo
  for each row when (pg_trigger_depth() = 0) execute function public.set_user_tracking();
