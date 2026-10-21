-- Seller delivery: a send marker on the share and the recipient's open.
-- Compiled from supabase/schemas/38-document-share.sql; edit that file, not this one.

alter table public.document_share add column if not exists delivered_at timestamptz;

create or replace function public.open_document_share(share_id uuid)
  returns text
  language sql security definer
  set search_path = '' as $$
  update public.document_share s
     set first_viewed_at = coalesce(s.first_viewed_at, now())
    from public.generated_document g
   where s.id = share_id
     and s.recipient_user_id = (select auth.uid())
     and g.id = s.generated_document_id
  returning g.pdf_path;
$$;

revoke all on function public.open_document_share(uuid) from public, anon;
grant execute on function public.open_document_share(uuid) to authenticated;
