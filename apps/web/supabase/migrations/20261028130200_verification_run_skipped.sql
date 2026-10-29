-- A verification run that cannot proceed, for example at the monthly AI cap, is
-- skipped with its reason in skipped_reason rather than left failed.

alter type public.verification_run_status add value 'skipped';
