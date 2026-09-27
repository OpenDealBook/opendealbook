-- Roles available to memberships. hierarchy_level orders authority; the lowest
-- number is the most powerful role.

create table if not exists public.roles (
  name varchar(50) primary key,
  hierarchy_level int not null unique check (hierarchy_level > 0)
);

alter table public.roles enable row level security;

revoke all on public.roles from authenticated, service_role;
grant select on public.roles to authenticated, service_role;

create policy roles_read on public.roles
  for select to authenticated using (true);
