-- Canvas positions live beside the graph; the runner never reads them.
alter table public.workflow_version
  add column layout jsonb not null default '{}'::jsonb;

grant insert (layout) on public.workflow_version to authenticated;
grant update (layout) on public.workflow_version to authenticated;

-- When a draft was last saved; publishing does not count as a save.
alter table public.workflow_version
  add column saved_at timestamptz not null default now();

create or replace function tuckin.stamp_workflow_version_saved()
  returns trigger
  language plpgsql
  set search_path = '' as $$
begin
  new.saved_at := now();
  return new;
end;
$$;

create trigger stamp_workflow_version_saved
  before update of schema_version, graph, layout on public.workflow_version
  for each row execute function tuckin.stamp_workflow_version_saved();
