grant select on public.counsel_message to authenticated;

create policy counsel_message_read on public.counsel_message
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or public.is_deal_counsel(deal_id, side)
  );

alter publication supabase_realtime add table public.counsel_message;
alter publication supabase_realtime add table public.contract_comment;
