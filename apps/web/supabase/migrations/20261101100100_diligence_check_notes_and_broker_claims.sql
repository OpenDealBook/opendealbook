alter table public.diligence_search_check add column if not exists notes text[];

alter table public.diligence_broker_check add column if not exists claimed_at timestamptz;

revoke update on public.diligence_broker_check from service_role;
grant update (broker, state, started_at, claimed_at) on public.diligence_broker_check to service_role;
