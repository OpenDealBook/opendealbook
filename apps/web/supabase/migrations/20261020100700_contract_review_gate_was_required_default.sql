-- was_required is filled by a trigger on insert; a default lets callers leave
-- it out. Compiled from supabase/schemas/99u-contract-review.sql; edit that,
-- not this one.

alter table public.contract_review_gate_default_change alter column was_required set default false;
alter table public.deal_contract_review_gate_change alter column was_required set default false;
