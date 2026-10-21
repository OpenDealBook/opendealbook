-- Compiled from supabase/schemas/15-roles-seed.sql; edit that file, not this one.

insert into public.role_permissions (role, permission) values ('admin', 'roles.manage')
on conflict (role, permission) do nothing;
