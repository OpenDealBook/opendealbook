alter table public.workflow_version
  drop constraint workflow_version_published_by_fkey,
  add constraint workflow_version_published_by_fkey foreign key (published_by) references auth.users (id) on delete set null,
  drop constraint workflow_version_check,
  add constraint workflow_version_check check (published_at is not null or published_by is null);
