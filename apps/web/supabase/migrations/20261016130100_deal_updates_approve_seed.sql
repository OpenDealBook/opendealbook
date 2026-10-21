insert into public.role_permissions (role, permission) values
  ('owner', 'deal_updates.approve'),
  ('admin', 'deal_updates.approve'),
  ('deal_lead', 'deal_updates.approve')
on conflict do nothing;
