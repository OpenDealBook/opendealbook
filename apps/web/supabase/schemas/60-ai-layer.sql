-- AI layer groundwork. pgvector powers embedding search over document chunks;
-- llm_endpoint holds each account's model and endpoint configuration; its
-- api_key_secret_ref names the env or secret-store entry that carries the bearer
-- token, so the raw key never lives in a table row; every
-- model call is written to ai_call_log for audit; document_chunk stores the
-- embedded text spans of data-room documents. ai_redaction_enabled toggles
-- whether an account's prompts are redacted before they leave the tenant.

create extension if not exists vector with schema extensions;

alter table public.accounts add column ai_redaction_enabled boolean not null default false;

create table if not exists public.llm_endpoint (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  provider text not null,
  model text not null,
  base_url text,
  api_key_secret_ref text,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users
);

alter table public.llm_endpoint enable row level security;

create index ix_llm_endpoint_account on public.llm_endpoint (account_id);

revoke all on public.llm_endpoint from authenticated, service_role;
grant select, insert, update, delete on public.llm_endpoint to authenticated;
grant select, insert, update, delete on public.llm_endpoint to service_role;

create trigger llm_endpoint_timestamps
  before insert or update on public.llm_endpoint
  for each row execute function public.set_timestamps();

create trigger llm_endpoint_user_tracking
  before insert or update on public.llm_endpoint
  for each row execute function public.set_user_tracking();

create policy llm_endpoint_read on public.llm_endpoint
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy llm_endpoint_insert on public.llm_endpoint
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'settings.manage'));

create policy llm_endpoint_update on public.llm_endpoint
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'settings.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'settings.manage'));

create policy llm_endpoint_delete on public.llm_endpoint
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'settings.manage'));

-- Append-only audit of model calls. created_by defaults to the acting user;
-- rows are never updated, so no timestamp trigger is wired.
create table if not exists public.ai_call_log (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  endpoint_id uuid references public.llm_endpoint (id) on delete set null,
  deal_id uuid references public.deal (id) on delete cascade,
  model text not null,
  prompt_tokens int,
  completion_tokens int,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users default auth.uid()
);

alter table public.ai_call_log enable row level security;

create index ix_ai_call_log_account on public.ai_call_log (account_id);

revoke all on public.ai_call_log from authenticated, service_role;
grant select on public.ai_call_log to authenticated;
grant select, insert, update, delete on public.ai_call_log to service_role;

create policy ai_call_log_read on public.ai_call_log
  for select to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'settings.manage'));

-- Embedded spans of a data-room document. Deal-scoped; access mirrors
-- dr_document so a chunk is reachable exactly when its document is.
create table if not exists public.document_chunk (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid not null references public.deal (id) on delete cascade,
  document_id uuid not null references public.dr_document (id) on delete cascade,
  chunk_index int not null,
  content text not null,
  embedding extensions.vector(1536),
  created_at timestamptz not null default now()
);

alter table public.document_chunk enable row level security;

create index ix_document_chunk_document on public.document_chunk (document_id);
create index ix_document_chunk_deal on public.document_chunk (deal_id);

revoke all on public.document_chunk from authenticated, service_role;
grant select, insert, update, delete on public.document_chunk to authenticated;
grant select, insert, update, delete on public.document_chunk to service_role;

create policy document_chunk_read on public.document_chunk
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or public.has_deal_permission(deal_id, 'deals.manage')
  );

create policy document_chunk_insert on public.document_chunk
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy document_chunk_update on public.document_chunk
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy document_chunk_delete on public.document_chunk
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));
