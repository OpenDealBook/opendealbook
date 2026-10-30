alter schema tuckin rename to odb;
CREATE OR REPLACE FUNCTION public.consume_mfa_recovery_code(p_code text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller uuid := auth.uid();
  target bytea;
  consumed uuid;
begin
  if caller is null or p_code is null or length(p_code) = 0 then
    return null;
  end if;

  target := odb.mfa_recovery_code_hmac(caller, p_code);

  update public.mfa_recovery_codes
    set used_at = now()
    where id = (
      select id
      from public.mfa_recovery_codes
      where user_id = caller
        and code_hmac = target
        and used_at is null
      for update skip locked
      limit 1
    )
  returning user_id into consumed;

  return consumed;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.create_nonce(purpose text, user_id uuid DEFAULT NULL::uuid, account_id uuid DEFAULT NULL::uuid, expires_in_seconds integer DEFAULT 3600, metadata jsonb DEFAULT '{}'::jsonb, scopes text[] DEFAULT '{}'::text[])
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  insert into public.nonces (token_hash, purpose, user_id, account_id, metadata, scopes, expires_at)
  values (
    odb.hash_token(token),
    create_nonce.purpose,
    create_nonce.user_id,
    create_nonce.account_id,
    create_nonce.metadata,
    create_nonce.scopes,
    now() + make_interval(secs => expires_in_seconds)
  );
  return token;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.delete_deal(p_deal_id uuid, p_confirm_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_deal record;
  v_result jsonb;
begin
  select d.account_id, d.archived_at, f.name, coalesce(d.code_name, f.name) as outside_name,
    a.name as team_name, coalesce(a.timezone, 'UTC') as timezone,
    case when exists (select 1 from public.deal_counsel c where c.deal_id = d.id and c.side = 'seller')
      then odb.seller_counsel_window_end(d.id) end as read_until
  into v_deal
  from public.deal d
  join public.firm f on f.id = d.firm_id
  join public.accounts a on a.id = d.account_id
  where d.id = p_deal_id
  for update of d;

  if not found or not public.has_role_on_account(v_deal.account_id) then
    raise exception 'This deal no longer exists.' using errcode = 'ODB02';
  end if;

  if not public.is_account_owner(v_deal.account_id) then
    raise exception 'Only the team owner can delete deals.' using errcode = 'ODB02';
  end if;

  if v_deal.archived_at is null then
    raise exception 'Archive the deal before deleting it.' using errcode = 'ODB02';
  end if;

  if p_confirm_name is distinct from v_deal.name then
    raise exception 'The name you typed does not match this deal.' using errcode = 'ODB02';
  end if;

  if v_deal.read_until > now() then
    raise exception 'Seller''s counsel can read this deal until %. You can delete it after that.',
      to_char(v_deal.read_until at time zone v_deal.timezone, 'FMMonth FMDD, YYYY')
      using errcode = 'ODB02';
  end if;

  select jsonb_build_object(
    'account_id', v_deal.account_id,
    'deal_id', p_deal_id,
    'team_name', v_deal.team_name,
    'files', (
      select coalesce(jsonb_agg(jsonb_build_object('bucket', file.bucket, 'path', file.path)), '[]'::jsonb)
      from (
        select o.bucket_id as bucket, o.name as path
        from storage.objects o
        where (o.bucket_id in ('data-room', 'meeting-recordings') and starts_with(o.name, 'deal/' || p_deal_id || '/'))
          or (o.bucket_id = 'seller-counsel-thread' and starts_with(o.name, p_deal_id || '/'))
        union
        select recorded.bucket, recorded.path
        from (
          select v.docx_bucket as bucket, v.docx_path as path
          from public.contract_version v join public.contract c on c.id = v.contract_id
          where c.deal_id = p_deal_id
          union
          select v.pdf_bucket, v.pdf_path
          from public.contract_version v join public.contract c on c.id = v.contract_id
          where c.deal_id = p_deal_id
          union
          select 'generated', path
          from public.generated_document g, unnest(array[g.docx_path, g.pdf_path]) path
          where g.deal_id = p_deal_id
        ) recorded
        where (storage.foldername(recorded.path))[1] = v_deal.account_id::text
      ) file
    ),
    'run_ids', (
      select coalesce(jsonb_agg(r.id), '[]'::jsonb)
      from public.workflow_run r
      where r.account_id = v_deal.account_id
        and r.status in ('running', 'waiting', 'awaiting_approval', 'paused_locked', 'paused_cap')
        and (r.trigger_output ->> 'dealId' = p_deal_id::text
          or r.id in (select dr.workflow_run_id from public.diligence_run dr where dr.deal_id = p_deal_id))
    ),
    'recipients', (
      select coalesce(jsonb_agg(jsonb_build_object('user_id', p.user_id, 'email', p.email, 'deal_name', p.deal_name)), '[]'::jsonb)
      from (
        select m.user_id, m.email, v_deal.outside_name as deal_name
        from public.lender_room_member m join public.lender_room r on r.id = m.room_id
        where r.deal_id = p_deal_id
        union
        select m.user_id, m.email, v_deal.name
        from public.seller_room_member m join public.seller_room r on r.id = m.room_id
        where r.deal_id = p_deal_id
        union
        select c.user_id, c.email, v_deal.outside_name
        from public.deal_counsel c
        where c.deal_id = p_deal_id
      ) p
    )
  ) into v_result;

  insert into public.account_event (account_id, event_type, payload)
  values (v_deal.account_id, 'deal.deleted', jsonb_build_object(
    'deal_id', p_deal_id,
    'deal_name', v_deal.name,
    'deleted_by', auth.uid()
  ));

  delete from public.deal where id = p_deal_id;

  return v_result;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.grant_workflow_loop_items(p_step_run_id uuid, p_root_node_id text, p_items jsonb, p_context jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_step public.workflow_step_run;
  v_run public.workflow_run;
  v_unit public.workflow_loop_saved_work;
  v_left int;
  v_total int := 0;
  v_saved int := 0;
  v_count int;
  v_granted jsonb;
  v_own jsonb := '[]'::jsonb;
  v_carried jsonb := '[]'::jsonb;
  v_resumes jsonb := '[]'::jsonb;
  v_output jsonb;
begin
  select * into v_step from public.workflow_step_run where id = p_step_run_id for update;
  if v_step.status = 'succeeded' then
    return v_step.output;
  end if;
  if v_step.status <> 'running' then
    return null;
  end if;
  select * into v_run from public.workflow_run where id = v_step.run_id for update;
  v_left := 500 - v_run.loop_items_processed;

  if p_root_node_id = v_step.node_id then
    for v_unit in
      select w.* from public.workflow_loop_saved_work w
      join public.workflow_run saver on saver.id = w.saved_by_run_id
      where w.workflow_id = v_run.workflow_id
        and w.root_node_id = p_root_node_id
        and w.claimed_by_run_id is null
        and saver.version_id = v_run.version_id
      order by w.created_at
      for update of w
    loop
      update public.workflow_loop_saved_work set claimed_by_run_id = v_run.id where id = v_unit.id;
      v_count := jsonb_array_length(v_unit.items);
      v_total := v_total + v_count;
      v_granted := odb.jsonb_array_slice(v_unit.items, 0, v_left);
      v_left := v_left - jsonb_array_length(v_granted);
      if jsonb_array_length(v_granted) < v_count then
        v_saved := v_saved + v_count - jsonb_array_length(v_granted);
        insert into public.workflow_loop_saved_work
          (account_id, workflow_id, root_node_id, node_id, items, context, saved_by_run_id)
        values (v_run.account_id, v_run.workflow_id, p_root_node_id, v_unit.node_id,
          odb.jsonb_array_slice(v_unit.items, jsonb_array_length(v_granted), v_count),
          v_unit.context, v_run.id);
      end if;
      if jsonb_array_length(v_granted) > 0 then
        if v_unit.node_id = v_step.node_id then
          v_own := v_own || v_granted;
          v_carried := v_carried || jsonb_build_array(jsonb_build_object(
            'items', v_granted, 'context', v_unit.context));
        else
          v_resumes := v_resumes || jsonb_build_array(jsonb_build_object(
            'nodeId', v_unit.node_id, 'items', v_granted, 'context', v_unit.context,
            'complete', jsonb_array_length(v_granted) = v_count));
        end if;
      end if;
    end loop;
  end if;

  v_count := jsonb_array_length(p_items);
  v_total := v_total + v_count;
  v_granted := odb.jsonb_array_slice(p_items, 0, v_left);
  v_left := v_left - jsonb_array_length(v_granted);
  v_own := v_own || v_granted;
  if jsonb_array_length(v_granted) < v_count then
    v_saved := v_saved + v_count - jsonb_array_length(v_granted);
    insert into public.workflow_loop_saved_work
      (account_id, workflow_id, root_node_id, node_id, items, context, saved_by_run_id)
    values (v_run.account_id, v_run.workflow_id, p_root_node_id, v_step.node_id,
      odb.jsonb_array_slice(p_items, jsonb_array_length(v_granted), v_count),
      p_context, v_run.id);
  end if;

  update public.workflow_run
  set loop_items_processed = 500 - v_left, loop_items_total = loop_items_total + v_total
  where id = v_run.id;

  v_output := jsonb_build_object(
    'items', v_own,
    'processed', jsonb_array_length(v_own),
    'total', v_total,
    'saved', v_saved,
    'carried', v_carried,
    'resumes', v_resumes,
    'released', '[]'::jsonb
  );
  update public.workflow_step_run
  set status = 'succeeded', output = v_output, finished_at = now()
  where id = p_step_run_id;

  return v_output;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.is_account_locked(target_account_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is not null and not public.has_role_on_account(target_account_id) then
    raise exception 'not a member of this account' using errcode = 'insufficient_privilege';
  end if;
  return odb.team_locked(target_account_id);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.replace_mfa_recovery_codes(p_codes text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller uuid := auth.uid();
  code text;
begin
  if caller is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if not public.is_aal2() then
    raise exception 'multi-factor verification required' using errcode = '28000';
  end if;

  if p_codes is null or array_length(p_codes, 1) is null then
    raise exception 'at least one code is required' using errcode = '22023';
  end if;

  foreach code in array p_codes loop
    if code is null or length(code) < 8 then
      raise exception 'code too short' using errcode = '22023';
    end if;
  end loop;

  delete from public.mfa_recovery_codes where user_id = caller;

  insert into public.mfa_recovery_codes (user_id, code_hmac)
  select caller, odb.mfa_recovery_code_hmac(caller, c)
  from unnest(p_codes) as c;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.save_llm_endpoint(p_account_id uuid, p_provider text, p_model text, p_base_url text, p_api_key text DEFAULT NULL::text, p_embedding_model text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  existing public.llm_endpoint;
  secret_id uuid;
  base_url text := case p_provider
    when 'openai' then 'https://api.openai.com/v1'
    when 'anthropic' then 'https://api.anthropic.com/v1'
    else p_base_url
  end;
begin
  if not public.has_permission((select auth.uid()), p_account_id, 'settings.manage') then
    raise exception 'changing the AI provider needs settings.manage' using errcode = 'insufficient_privilege';
  end if;

  if p_provider = 'anthropic' and p_embedding_model is not null then
    raise exception 'Anthropic has no embeddings API; leave Embedding model empty' using errcode = 'data_exception';
  end if;

  if p_provider = 'openai_compatible'
    and coalesce(current_setting('odb.allow_private_ai_url', true), '') <> 'on'
    and not coalesce(odb.public_https_base_url(p_base_url), false) then
    raise exception 'use a public https base URL' using errcode = 'invalid_parameter_value';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('llm_endpoint:' || p_account_id, 0));

  select * into existing from public.llm_endpoint where account_id = p_account_id;
  secret_id := existing.api_key_secret_id;

  if p_api_key is null and (
    secret_id is null
    or existing.provider is distinct from p_provider
    or existing.base_url is distinct from base_url
  ) then
    raise exception 'paste an API key' using errcode = 'check_violation';
  end if;

  if p_api_key is not null and secret_id is not null then
    perform vault.update_secret(secret_id, p_api_key);
  elsif p_api_key is not null then
    secret_id := vault.create_secret(p_api_key);
  end if;

  insert into public.llm_endpoint (account_id, provider, chat_model, model, base_url, api_key_secret_id)
  values (p_account_id, p_provider, p_model, p_embedding_model, base_url, secret_id)
  on conflict (account_id) do update
    set provider = excluded.provider,
        chat_model = excluded.chat_model,
        model = excluded.model,
        base_url = excluded.base_url,
        api_key_secret_id = excluded.api_key_secret_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.save_workflow_draft(p_workflow_id uuid, p_graph jsonb, p_layout jsonb)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_workflow record;
  v_saved_at timestamptz;
begin
  select account_id, archived_at into v_workflow from public.workflow where id = p_workflow_id;

  if v_workflow.account_id is null or not public.has_permission(auth.uid(), v_workflow.account_id, 'workflows.manage') then
    raise exception 'saving a workflow draft needs workflows.manage' using errcode = 'insufficient_privilege';
  end if;
  if v_workflow.archived_at is not null then
    raise exception 'Unarchive this workflow first' using errcode = 'object_not_in_prerequisite_state';
  end if;
  if jsonb_typeof(p_graph -> 'nodes') is distinct from 'array' or jsonb_typeof(p_graph -> 'edges') is distinct from 'array' then
    raise exception 'A workflow needs nodes and edges lists' using errcode = 'invalid_parameter_value';
  end if;
  if jsonb_typeof(p_layout) is distinct from 'object' then
    raise exception 'A workflow layout must be an object' using errcode = 'invalid_parameter_value';
  end if;
  if jsonb_array_length(p_graph -> 'nodes') > 200 then
    raise exception 'A workflow can have at most 200 steps' using errcode = 'invalid_parameter_value';
  end if;
  if octet_length(p_graph::text) + octet_length(p_layout::text) > 1048576 then
    raise exception 'A workflow is too large to save' using errcode = 'program_limit_exceeded';
  end if;

  insert into public.workflow_version as v (account_id, workflow_id, schema_version, graph, layout)
  values (v_workflow.account_id, p_workflow_id, odb.current_workflow_schema_version(), p_graph, p_layout)
  on conflict (workflow_id) where published_at is null
  do update set schema_version = excluded.schema_version, graph = excluded.graph, layout = excluded.layout
  returning v.saved_at into v_saved_at;

  return v_saved_at;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.seed_background_search_workflow(p_account_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  select p_account_id, v_workflow_id, odb.current_workflow_schema_version(),
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
$function$
;
CREATE OR REPLACE FUNCTION public.seller_counsel_read_until(deal_id uuid)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select odb.seller_counsel_window_end(seller_counsel_read_until.deal_id)
  where exists (
    select 1 from public.deal_counsel c
    where c.deal_id = seller_counsel_read_until.deal_id and c.side = 'seller' and c.user_id = (select auth.uid())
  );
$function$
;
CREATE OR REPLACE FUNCTION public.set_default_checklist_template(template_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_template public.checklist_template;
begin
  select * into v_template from public.checklist_template t where t.id = set_default_checklist_template.template_id;

  if not found or not public.has_permission((select auth.uid()), v_template.account_id, 'deals.manage') then
    raise exception 'not authorized to change checklist templates' using errcode = 'insufficient_privilege';
  end if;

  if odb.team_locked(v_template.account_id) then
    raise exception 'team is read-only' using errcode = 'insufficient_privilege';
  end if;

  update public.checklist_template t
  set is_default = false
  where t.account_id = v_template.account_id and t.kind is not distinct from v_template.kind
    and t.is_default and t.id <> v_template.id;

  update public.checklist_template t set is_default = true where t.id = v_template.id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.storage_object_team_locked(bucket text, object_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_account_id uuid;
begin
  if bucket in ('templates', 'generated', 'contracts', 'vendor-imports', 'buyer-profile') then
    target_account_id := ((storage.foldername(object_name))[1])::uuid;
  elsif bucket in ('data-room', 'meeting-recordings') then
    select account_id into target_account_id from public.deal
    where id = ((storage.foldername(object_name))[2])::uuid;
  end if;
  return odb.team_locked(target_account_id) and public.has_role_on_account(target_account_id);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.team_billing_standing(target_account_id uuid)
 RETURNS billing_standing
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is not null and not public.has_role_on_account(target_account_id) then
    raise exception 'not a member of this account' using errcode = 'insufficient_privilege';
  end if;
  if odb.team_locked(target_account_id) then
    return 'locked';
  end if;
  if public.is_set('enable_team_account_billing')
    and exists (
      select 1 from public.subscriptions
      where account_id = target_account_id and status = 'past_due'
    )
    and not exists (
      select 1 from public.subscriptions
      where account_id = target_account_id and status in ('active', 'trialing')
    ) then
    return 'past_due';
  end if;
  return 'good';
end;
$function$
;
CREATE OR REPLACE FUNCTION odb.assign_team_slug()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  base text := case when tg_op = 'INSERT' then coalesce(new.slug, odb.slugify(new.name)) else odb.slugify(new.name) end;
  candidate text := rtrim(left(base, 64), '-');
  suffix int := 0;
begin
  if base = '' then
    raise exception 'team name must contain a letter or number';
  end if;
  while candidate in ('settings', 'create-team', 'deals', 'billing', 'todos', 'outreach', 'underwriting', 'counsel')
    or exists (select 1 from public.accounts where slug = candidate and id <> new.id)
    or exists (select 1 from public.account_slug_history where slug = candidate and account_id <> new.id) loop
    suffix := suffix + 1;
    candidate := rtrim(left(base, 63 - length(suffix::text)), '-') || '-' || suffix;
  end loop;
  new.slug := candidate;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION odb.mfa_recovery_code_hmac(user_id uuid, code text)
 RETURNS bytea
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select extensions.hmac(
    mfa_recovery_code_hmac.user_id::text || ':' || upper(regexp_replace(mfa_recovery_code_hmac.code, '[\s-]+', '', 'g')),
    odb.mfa_recovery_pepper(),
    'sha256'
  );
$function$
;
CREATE OR REPLACE FUNCTION odb.refuse_cross_team_link()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  own_ref text := to_jsonb(new) ->> tg_argv[0];
  linked_team uuid := odb.team_of_row(to_jsonb(new), tg_argv[2], tg_argv[3]);
  own_parent_exists boolean;
begin
  if linked_team is null then
    return new;
  end if;

  if own_ref is null then
    if exists (
      select 1 from pg_attribute
      where attrelid = tg_relid and attname = tg_argv[0] and attnotnull
    ) then
      return new;
    end if;
  elsif tg_argv[1] <> '' then
    execute format('select exists (select 1 from public.%I where id = $1::uuid)', tg_argv[1])
      into own_parent_exists using own_ref;
    if not own_parent_exists then
      return new;
    end if;
  end if;

  if odb.team_of_row(to_jsonb(new), tg_argv[0], nullif(tg_argv[1], '')) is distinct from linked_team then
    raise exception 'rows cannot link across teams' using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION odb.refuse_locked_api_key_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  written public.api_key;
begin
  if tg_op = 'UPDATE' then
    perform odb.refuse_team_move_of(to_jsonb(old), to_jsonb(new));
  end if;

  if tg_op = 'DELETE' then
    written := old;
  else
    written := new;
  end if;

  if odb.team_locked(written.account_id)
    and public.has_role_on_account(written.account_id)
    and not (
      tg_op = 'UPDATE'
      and old.revoked_at is null
      and new.revoked_at is not null
      and to_jsonb(old) - 'revoked_at' = to_jsonb(new) - 'revoked_at'
    ) then
    raise exception 'team is read-only' using errcode = 'insufficient_privilege';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION odb.refuse_locked_ask_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  written public.lender_ask;
begin
  if tg_op = 'UPDATE' then
    perform odb.refuse_team_move_of(to_jsonb(old), to_jsonb(new));
  end if;

  if tg_op = 'DELETE' then
    written := old;
  else
    written := new;
  end if;

  if odb.team_locked(written.account_id)
    and public.has_role_on_account(written.account_id)
    and not (
      tg_op = 'UPDATE'
      and new.status in ('answered', 'closed')
      and to_jsonb(old) - 'status' - 'first_response_at' = to_jsonb(new) - 'status' - 'first_response_at'
    ) then
    raise exception 'team is read-only' using errcode = 'insufficient_privilege';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION odb.refuse_locked_membership_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'UPDATE' then
    perform odb.refuse_team_move_of(to_jsonb(old), to_jsonb(new));
  end if;

  if odb.team_locked(new.account_id)
    and not (
      tg_op = 'UPDATE'
      and public.is_account_owner(new.account_id)
      and to_jsonb(old) - 'account_role' - 'updated_at' - 'updated_by'
        = to_jsonb(new) - 'account_role' - 'updated_at' - 'updated_by'
    ) then
    raise exception 'team is read-only' using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION odb.refuse_team_move()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform odb.refuse_team_move_of(to_jsonb(old), to_jsonb(new));
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION odb.refuse_write_when_team_locked()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  team_ids uuid[] := '{}';
  team_id uuid;
begin
  if tg_op = 'UPDATE' then
    perform odb.refuse_team_move_of(to_jsonb(old), to_jsonb(new));
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    team_ids := team_ids || odb.team_of_row(to_jsonb(old), tg_argv[1], tg_argv[2]);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    team_ids := team_ids || odb.team_of_row(to_jsonb(new), tg_argv[1], tg_argv[2]);
  end if;

  if tg_op = 'UPDATE' and auth.uid() is not null and team_ids[1] is distinct from team_ids[2] then
    raise exception 'rows cannot move between teams' using errcode = 'insufficient_privilege';
  end if;

  foreach team_id in array team_ids loop
    if odb.team_locked(team_id) and public.has_role_on_account(team_id) then
      raise exception 'team is read-only' using errcode = 'insufficient_privilege';
    end if;
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.verify_nonce(token text, purpose text, required_scopes text[] DEFAULT NULL::text[], max_verification_attempts integer DEFAULT 5)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  matched public.nonces;
  attempt_ceiling integer := least(greatest(coalesce(max_verification_attempts, 5), 1), 10);
begin
  update public.nonces n
    set verification_attempts = n.verification_attempts + 1
    where n.id = (
      select id
      from public.nonces
      where token_hash = odb.hash_token(token)
        and nonces.purpose = verify_nonce.purpose
        and used_at is null
        and expires_at > now()
      for update skip locked
      limit 1
    )
  returning n.* into matched;

  if matched.id is null then
    return jsonb_build_object('valid', false, 'message', 'invalid, expired, or already used token');
  end if;

  if matched.verification_attempts > attempt_ceiling then
    update public.nonces set used_at = now() where id = matched.id and used_at is null;
    return jsonb_build_object(
      'valid', false,
      'message', 'token locked after too many attempts',
      'max_attempts_exceeded', true
    );
  end if;

  if required_scopes is not null
     and array_length(required_scopes, 1) > 0
     and not (matched.scopes @> required_scopes) then
    return jsonb_build_object(
      'valid', false,
      'message', 'token missing required scopes',
      'token_scopes', matched.scopes,
      'required_scopes', required_scopes
    );
  end if;

  update public.nonces set used_at = now() where id = matched.id;

  return jsonb_build_object(
    'valid', true,
    'user_id', matched.user_id,
    'metadata', matched.metadata,
    'scopes', matched.scopes,
    'purpose', matched.purpose
  );
end;
$function$
;
