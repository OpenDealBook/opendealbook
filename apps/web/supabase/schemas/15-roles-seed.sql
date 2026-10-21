-- Seed roles and their permissions. owner outranks admin outranks member.

insert into public.roles (name, hierarchy_level) values
  ('owner', 1),
  ('admin', 2),
  ('member', 3);

insert into public.role_permissions (role, permission) values
  ('owner', 'roles.manage'),
  ('owner', 'billing.manage'),
  ('owner', 'settings.manage'),
  ('owner', 'members.manage'),
  ('owner', 'invites.manage'),
  ('owner', 'api_keys.manage'),
  ('owner', 'deal_updates.approve'),
  ('admin', 'roles.manage'),
  ('admin', 'settings.manage'),
  ('admin', 'members.manage'),
  ('admin', 'invites.manage'),
  ('admin', 'api_keys.manage'),
  ('admin', 'deal_updates.approve');
