-- One row per step execution, keyed by idempotency_key. A retry, by Temporal or
-- of a failed run, reuses the row and counts attempt on.
alter table public.workflow_step_run
  drop constraint workflow_step_run_run_id_node_id_attempt_key;
