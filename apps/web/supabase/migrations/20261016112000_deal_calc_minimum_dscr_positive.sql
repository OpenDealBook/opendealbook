alter table public.deal_calc_defaults
  drop constraint if exists deal_calc_defaults_minimum_dscr_positive;
alter table public.deal_calc_defaults
  add constraint deal_calc_defaults_minimum_dscr_positive check (minimum_dscr > 0);
