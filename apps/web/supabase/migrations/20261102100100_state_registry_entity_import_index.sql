-- Deploy note: run VACUUM (ANALYZE) public.state_registry_entity after 20261102100000, whose address move rewrote every CO row.
create index ix_state_registry_entity_import on public.state_registry_entity (import_id);
