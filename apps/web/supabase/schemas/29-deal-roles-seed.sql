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

-- owner and admin keep full deal control alongside their existing permissions.
insert into public.role_permissions (role, permission) values
  ('owner', 'deals.create'),
  ('owner', 'deals.manage'),
  ('owner', 'checklists.manage'),
  ('owner', 'participants.manage'),
  ('admin', 'deals.create'),
  ('admin', 'deals.manage'),
  ('admin', 'checklists.manage'),
  ('admin', 'participants.manage'),
  ('deal_lead', 'deals.create'),
  ('deal_lead', 'deals.manage'),
  ('deal_lead', 'checklists.manage'),
  ('deal_lead', 'participants.manage'),
  ('analyst', 'deals.create'),
  ('analyst', 'checklists.manage'),
  ('counsel', 'checklists.manage');
