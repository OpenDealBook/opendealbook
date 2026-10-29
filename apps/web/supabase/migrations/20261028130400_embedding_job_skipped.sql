-- An embedding job that cannot index its document, for want of an AI key or
-- embedding model, on an Anthropic team, or at the monthly AI cap, is skipped with
-- its reason in skipped_reason rather than marked done.

alter type public.embedding_job_status add value 'skipped';
