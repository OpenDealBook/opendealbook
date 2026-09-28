-- AI ingestion index. The ivfflat index over document_chunk.embedding lets RAG
-- retrieval run cosine-similarity search without a full scan. embedding_job
-- tracks each Docling ingestion and embedding run for a data-room document.
-- Deal-scoped; access mirrors document_chunk and dr_document.

create index ix_document_chunk_embedding on public.document_chunk
  using ivfflat (embedding extensions.vector_cosine_ops) with (lists = 100);

create type public.embedding_job_status as enum ('queued', 'running', 'done', 'failed');

create table if not exists public.embedding_job (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid not null references public.deal (id) on delete cascade,
  dr_document_id uuid not null references public.dr_document (id) on delete cascade,
  status public.embedding_job_status not null default 'queued',
  chunk_count int,
  model text,
  error text,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users default auth.uid()
);

alter table public.embedding_job enable row level security;

create index ix_embedding_job_deal on public.embedding_job (deal_id);
create index ix_embedding_job_document on public.embedding_job (dr_document_id);

revoke all on public.embedding_job from authenticated, service_role;
grant select, insert, update, delete on public.embedding_job to authenticated;
grant select, insert, update, delete on public.embedding_job to service_role;

create trigger embedding_job_timestamps
  before insert or update on public.embedding_job
  for each row execute function public.set_timestamps();

create policy embedding_job_read on public.embedding_job
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or public.has_deal_permission(deal_id, 'deals.manage')
  );

create policy embedding_job_insert on public.embedding_job
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy embedding_job_update on public.embedding_job
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy embedding_job_delete on public.embedding_job
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));
