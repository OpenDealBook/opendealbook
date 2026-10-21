alter table public.deal_calc_defaults
  add column if not exists year_basis text not null default 'months_from_close'
  check (year_basis in ('months_from_close', 'fiscal_year'));
