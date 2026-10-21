-- Per-tenant deal roles layered onto owner/admin/member. External roles
-- (external_counsel, seller, broker) carry no tenant permissions: they reach a
-- deal only through a deal_participant grant. deal_owner is not a tenant role;
-- it is deal.owner_user_id plus a participant row.

insert into public.roles (name, hierarchy_level) values
  ('deal_lead', 4),
  ('analyst', 5),
  ('counsel', 6),
  ('external_counsel', 7),
  ('seller', 8),
  ('broker', 9),
  ('viewer', 10);

-- owner, admin and deal_lead manage deals; member and analyst do the same deal
-- work without managing.
insert into public.role_permissions (role, permission) values
  ('owner', 'deals.create'),
  ('owner', 'deals.manage'),
  ('owner', 'deals.work'),
  ('owner', 'checklists.manage'),
  ('owner', 'participants.manage'),
  ('owner', 'buyer_profile.manage'),
  ('admin', 'deals.create'),
  ('admin', 'deals.manage'),
  ('admin', 'deals.work'),
  ('admin', 'checklists.manage'),
  ('admin', 'participants.manage'),
  ('admin', 'buyer_profile.manage'),
  ('deal_lead', 'deals.create'),
  ('deal_lead', 'deals.manage'),
  ('deal_lead', 'deals.work'),
  ('deal_lead', 'checklists.manage'),
  ('deal_lead', 'participants.manage'),
  ('deal_lead', 'deal_updates.approve'),
  ('analyst', 'deals.create'),
  ('analyst', 'deals.work'),
  ('analyst', 'checklists.manage'),
  ('member', 'deals.create'),
  ('member', 'deals.work'),
  ('member', 'checklists.manage'),
  ('counsel', 'checklists.manage');
