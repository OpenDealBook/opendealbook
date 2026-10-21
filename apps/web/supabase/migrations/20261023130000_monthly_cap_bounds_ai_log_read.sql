alter table public.outreach_setting
  add constraint outreach_setting_letter_monthly_cap_range check (letter_monthly_cap between 0 and 100000),
  add constraint outreach_setting_lookup_monthly_cap_range check (lookup_monthly_cap between 0 and 100000),
  add constraint outreach_setting_ai_monthly_cap_range check (ai_monthly_cap between 0 and 100000);

drop policy ai_call_log_read on public.ai_call_log;

create policy ai_call_log_read on public.ai_call_log
  for select to authenticated
  using (
    public.has_permission((select auth.uid()), account_id, 'settings.manage')
    or public.has_permission((select auth.uid()), account_id, 'deals.manage')
  );
