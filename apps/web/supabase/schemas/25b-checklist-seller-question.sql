-- The seller-room question that asked for a checklist item, so the seller's
-- answer can mark the item received. No foreign keys: replay_deal deletes a
-- deal's checklist items and puts them back under the same ids, and the
-- question table is declared later, in 99e-seller-rooms.sql. Server code
-- reads and writes it as the service.

create table if not exists public.checklist_item_seller_question (
  question_id uuid primary key,
  checklist_item_id uuid not null
);

alter table public.checklist_item_seller_question enable row level security;

revoke all on public.checklist_item_seller_question from anon, authenticated, service_role;
grant select, insert on public.checklist_item_seller_question to service_role;
