drop trigger refuse_published_version_change on public.workflow_version;

-- Deleting the publisher clears published_by; nothing else about a published
-- version changes.
create trigger refuse_published_version_change
  before update on public.workflow_version
  for each row when (
    old.published_at is not null
    and (
      (to_jsonb(new) - 'published_by') is distinct from (to_jsonb(old) - 'published_by')
      or new.published_by is distinct from old.published_by and new.published_by is not null
    )
  )
  execute function tuckin.refuse_published_version_change();
