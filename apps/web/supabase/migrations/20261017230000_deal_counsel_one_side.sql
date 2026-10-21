alter table public.deal_counsel
  add constraint deal_counsel_one_side unique (deal_id, user_id);
