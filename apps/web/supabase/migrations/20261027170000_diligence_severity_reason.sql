alter table public.diligence_finding add column if not exists severity_reason text;

alter table public.diligence_report alter column model drop not null;

grant update (severity, severity_reason) on public.diligence_finding to service_role;

drop trigger if exists refuse_rerating_finding on public.diligence_finding;

create trigger refuse_rerating_finding
  before update of severity, severity_reason on public.diligence_finding
  for each row when (old.severity is not null or old.severity_reason is not null)
  execute function tuckin.refuse_rerating_finding();
