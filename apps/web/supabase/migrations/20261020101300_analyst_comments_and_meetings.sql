drop policy contract_comment_insert on public.contract_comment;
create policy contract_comment_insert on public.contract_comment
  for insert to authenticated
  with check (
    author_user_id = (select auth.uid())
    and author_side = 'buyer'
    and public.has_permission((select auth.uid()), account_id, 'deals.work')
  );

drop policy contract_comment_resolve on public.contract_comment;
create policy contract_comment_resolve on public.contract_comment
  for update to authenticated
  using (author_side = 'buyer' and public.has_permission((select auth.uid()), account_id, 'deals.work'))
  with check (author_side = 'buyer' and public.has_permission((select auth.uid()), account_id, 'deals.work'));

drop policy meeting_series_insert on public.meeting_series;
create policy meeting_series_insert on public.meeting_series
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.work'));

drop policy meeting_series_update on public.meeting_series;
create policy meeting_series_update on public.meeting_series
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.work'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.work'));
