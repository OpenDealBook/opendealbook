drop policy contract_review_gate_default_change_insert on public.contract_review_gate_default_change;

create policy contract_review_gate_default_change_insert on public.contract_review_gate_default_change
  for insert to authenticated
  with check (
    public.has_role_on_account(account_id, 'owner')
    or public.has_role_on_account(account_id, 'admin')
  );
