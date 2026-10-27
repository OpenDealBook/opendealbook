create unique index ux_outreach_enrollment_active_firm_sequence
  on public.outreach_enrollment (firm_id, sequence_id)
  where status in ('queued', 'held', 'sent');
