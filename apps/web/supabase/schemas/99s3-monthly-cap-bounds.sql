-- A team's monthly caps for letters and paid lookups stay between 0 and
-- 100,000, and its AI credits between 0 and 10,000,000 ($100,000).
alter table public.outreach_setting
  add constraint outreach_setting_letter_monthly_cap_range check (letter_monthly_cap between 0 and 100000),
  add constraint outreach_setting_lookup_monthly_cap_range check (lookup_monthly_cap between 0 and 100000),
  add constraint outreach_setting_ai_monthly_credit_cap_range check (ai_monthly_credit_cap between 0 and 10000000);
