-- Per-deal RAG retrieval over document_chunk. llm_endpoint gains chat_model:
-- `model` stays the embedding model, chat_model names the generation model used
-- for the answer call. match_document_chunks runs the ivfflat cosine search
-- inside one transaction so `set local ivfflat.probes` governs the scan for the
-- statement that follows; security invoker keeps the caller's deal-scoped RLS on
-- document_chunk in force, and the deal_id filter narrows the search to one deal.

alter table public.llm_endpoint add column chat_model text;

create or replace function public.match_document_chunks(
  p_deal_id uuid,
  p_embedding extensions.vector(1536),
  p_match_count int)
  returns table (id uuid, content text, distance float)
  language plpgsql security invoker
  set search_path = '' as $$
begin
  set local ivfflat.probes = 10;
  return query
    select c.id, c.content,
           c.embedding operator(extensions.<=>) p_embedding as distance
    from public.document_chunk c
    where c.deal_id = match_document_chunks.p_deal_id
    order by c.embedding operator(extensions.<=>) p_embedding
    limit match_document_chunks.p_match_count;
end;
$$;

grant execute on function public.match_document_chunks(uuid, extensions.vector, int) to authenticated, service_role;
