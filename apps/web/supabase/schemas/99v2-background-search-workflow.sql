-- Every team has a Background search workflow: when a deal's LOI is signed it
-- searches the deal's business and people, then writes the report. It is
-- seeded published and switched on from the latest deal event, so LOIs signed
-- before it existed are not searched; the team edits, switches off or archives
-- it like any workflow. A team that already has one keeps it as it is. The
-- graph passes the same validation as a published workflow; the background
-- search integration test checks the seeded version against the TypeScript
-- graph schema.
create or replace function public.seed_background_search_workflow(p_account_id uuid)
  returns void
  language plpgsql security definer
  set search_path = '' as $$
declare
  v_workflow_id uuid;
begin
  insert into public.workflow (account_id, name, system_key)
  values (p_account_id, 'Background search', 'background_search')
  on conflict (account_id, system_key) do nothing
  returning id into v_workflow_id;

  if v_workflow_id is null then
    return;
  end if;

  insert into public.workflow_version (account_id, workflow_id, schema_version, graph, layout, published_at, published_by)
  select p_account_id, v_workflow_id, tuckin.current_workflow_schema_version(),
    '{
      "nodes": [
        {"id": "loi-signed", "type": "event_trigger", "config": {"eventType": "deal.loi_signed"}},
        {"id": "search", "type": "diligence_search", "config": {"dealId": "{{steps.loi-signed.dealId}}"}},
        {"id": "report", "type": "diligence_report", "config": {"runId": "{{steps.search.runId}}"}}
      ],
      "edges": [
        {"id": "loi-signed-search", "sourceNodeId": "loi-signed", "targetNodeId": "search"},
        {"id": "search-report", "sourceNodeId": "search", "targetNodeId": "report"}
      ]
    }'::jsonb,
    '{
      "direction": "RIGHT",
      "positions": {
        "loi-signed": {"x": 0, "y": 0},
        "search": {"x": 300, "y": 0},
        "report": {"x": 600, "y": 0}
      }
    }'::jsonb,
    now(), a.primary_owner_user_id
  from public.accounts a
  where a.id = p_account_id;

  update public.workflow set enabled = true where id = v_workflow_id;
end;
$$;

revoke all on function public.seed_background_search_workflow(uuid) from public, anon, authenticated;
grant execute on function public.seed_background_search_workflow(uuid) to service_role;

create or replace function public.seed_background_search_workflow_for_new_team()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  perform public.seed_background_search_workflow(new.id);
  return new;
end;
$$;

create trigger accounts_seed_background_search_workflow
  after insert on public.accounts
  for each row when (not new.is_personal_account)
  execute function public.seed_background_search_workflow_for_new_team();

-- A team archives a system workflow rather than deleting it; deleting the team
-- still takes it along.
create or replace function tuckin.refuse_system_workflow_delete()
  returns trigger
  language plpgsql
  set search_path = '' as $$
begin
  if exists (select 1 from public.accounts where id = old.account_id) then
    raise exception 'Background search can''t be deleted. Archive it instead.' using errcode = 'object_not_in_prerequisite_state';
  end if;
  return old;
end;
$$;

create trigger refuse_system_workflow_delete
  before delete on public.workflow
  for each row when (old.system_key is not null)
  execute function tuckin.refuse_system_workflow_delete();

-- At most one unfinished Background search per deal. Other workflows may run
-- for a deal any number of times at once, so this is a trigger rather than a
-- unique index on every run. The same trigger_ref is the same request arriving
-- again and is left to the run's own unique key.
create or replace function tuckin.refuse_second_unfinished_search()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  if not exists (
    select 1 from public.workflow
    where id = new.workflow_id and system_key = 'background_search'
  ) then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext(new.workflow_id::text || (new.trigger_output ->> 'dealId')));

  if exists (
    select 1 from public.workflow_run r
    where r.workflow_id = new.workflow_id
      and r.trigger_output ->> 'dealId' = new.trigger_output ->> 'dealId'
      and r.status in ('running', 'waiting', 'awaiting_approval', 'paused_locked', 'paused_cap')
      and r.id <> new.id
      and r.trigger_ref <> new.trigger_ref
  ) then
    raise exception 'A background search is already running for this deal' using errcode = 'unique_violation';
  end if;
  return new;
end;
$$;

create trigger refuse_second_unfinished_search
  before insert or update of status on public.workflow_run
  for each row when (
    new.status in ('running', 'waiting', 'awaiting_approval', 'paused_locked', 'paused_cap')
    and new.trigger_output ? 'dealId'
  )
  execute function tuckin.refuse_second_unfinished_search();
