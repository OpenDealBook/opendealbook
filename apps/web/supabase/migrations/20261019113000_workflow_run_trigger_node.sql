-- Compiled from supabase/schemas/99s-workflows.sql.

alter table public.workflow_run add column trigger_node_id text not null;
