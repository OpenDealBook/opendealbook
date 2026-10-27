begin;
select no_plan();

select tests.create_user('bmr_owner');
select tests.create_user('bmr_member');
select tests.create_user('bmr_outsider');

select tests.login_as_service_role();
select public.create_team_account('BMR Team', tests.get_uid('bmr_owner'), 'bmr-team');
select public.create_team_account('BMR Other', tests.get_uid('bmr_outsider'), 'bmr-other');

reset role;

insert into public.accounts_memberships (account_id, user_id, account_role)
values (tests.account_id('bmr-team'), tests.get_uid('bmr_member'), 'member');

insert into public.public_business (id, name) values ('e6000000-0000-0000-0000-0000000000b1', 'Acme Plumbing LLC');
insert into public.ppp_loan (loan_number, borrower_name) values ('bmr-1', 'Acme Plumbing and Heating');
insert into public.business_match_review (id, account_id, business_id, ppp_loan_number, score)
values ('e6000000-0000-0000-0000-0000000000e1', tests.account_id('bmr-team'), 'e6000000-0000-0000-0000-0000000000b1', 'bmr-1', 0.7);

select tests.login_as('bmr_member');

select is(
  (select count(*)::int from public.business_match_review),
  1,
  'a team member sees the team''s match reviews'
);
select is_empty(
  $$ update public.business_match_review
     set status = 'accepted', reviewed_by = tests.get_uid('bmr_member'), reviewed_at = now()
     where id = 'e6000000-0000-0000-0000-0000000000e1'
     returning id $$,
  'a team member without deals.manage cannot decide a match review'
);
select throws_ok(
  $$ insert into public.business_match_review (account_id, business_id, ppp_loan_number, score)
     values (tests.account_id('bmr-team'), 'e6000000-0000-0000-0000-0000000000b1', 'bmr-1', 0.8) $$,
  '42501', null, 'a team member cannot create match reviews'
);

select tests.login_as('bmr_outsider');

select is_empty(
  $$ update public.business_match_review
     set status = 'accepted', reviewed_by = tests.get_uid('bmr_outsider'), reviewed_at = now()
     where id = 'e6000000-0000-0000-0000-0000000000e1'
     returning id $$,
  'a deal manager of another team cannot decide the team''s match review'
);

select tests.login_as('bmr_owner');

select throws_ok(
  $$ update public.business_match_review
     set status = 'accepted', reviewed_by = tests.get_uid('bmr_member'), reviewed_at = now()
     where id = 'e6000000-0000-0000-0000-0000000000e1' $$,
  '42501', null, 'a deal manager decides only in their own name'
);
select throws_ok(
  $$ update public.business_match_review set score = 0.85 where id = 'e6000000-0000-0000-0000-0000000000e1' $$,
  '42501', null, 'a deal manager cannot change the match score'
);

reset role;

select is(
  (select status::text from public.business_match_review where id = 'e6000000-0000-0000-0000-0000000000e1'),
  'pending',
  'the review is still pending'
);

select is(
  (select reason::text from public.business_match_review where id = 'e6000000-0000-0000-0000-0000000000e1'),
  'weak_match',
  'a review is a weak match unless it says otherwise'
);

insert into public.ppp_loan (loan_number, borrower_name) values ('bmr-2', 'Acme Plumbing Inc');

select lives_ok(
  $$ insert into public.business_match_review (account_id, business_id, ppp_loan_number, score, reason)
     values (tests.account_id('bmr-other'), 'e6000000-0000-0000-0000-0000000000b1', 'bmr-2', 1, 'ein_conflict') $$,
  'a strong match to a business holding a different EIN is reviewed as an EIN conflict'
);
select throws_ok(
  $$ insert into public.business_match_review (account_id, business_id, ppp_loan_number, score, reason)
     values (tests.account_id('bmr-team'), 'e6000000-0000-0000-0000-0000000000b1', 'bmr-2', 0.89, 'ein_conflict') $$,
  '23514', null, 'an EIN conflict is a strong match'
);
select throws_ok(
  $$ insert into public.business_match_review (account_id, business_id, ppp_loan_number, score, reason)
     values (tests.account_id('bmr-team'), 'e6000000-0000-0000-0000-0000000000b1', 'bmr-2', 0.9, 'weak_match') $$,
  '23514', null, 'a weak match stays below 0.9'
);
select throws_ok(
  $$ insert into public.business_match_review (account_id, business_id, ppp_loan_number, score, reason)
     values (tests.account_id('bmr-team'), 'e6000000-0000-0000-0000-0000000000b1', 'bmr-2', 0.59, 'weak_match') $$,
  '23514', null, 'a weak match is at least 0.6'
);

select tests.login_as('bmr_owner');

select throws_ok(
  $$ update public.business_match_review set reason = 'ein_conflict' where id = 'e6000000-0000-0000-0000-0000000000e1' $$,
  '42501', null, 'a deal manager cannot change why a match is reviewed'
);

reset role;

select * from finish();
rollback;
