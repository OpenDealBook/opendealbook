begin;
select no_plan();

-- Team "CC Team" owns deal d1 and its APA. cc_owner manages the deal;
-- cc_member is on the team read-only, without deals.work. cc_buyer_law is buyer's
-- counsel and cc_seller_law seller's counsel. Version v1 is an internal buyer
-- draft; v2 is the version the seller side may see.
select tests.create_user('cc_owner');
select tests.create_user('cc_member');
select tests.create_user('cc_buyer_law');
select tests.create_user('cc_seller_law');
select tests.create_user('cc_stranger');
select tests.create_user('cc_other_owner');

select tests.login_as_service_role();
select public.create_team_account('CC Team', tests.get_uid('cc_owner'), 'cc-team');
select public.create_team_account('CC Other', tests.get_uid('cc_other_owner'), 'cc-other');
select public.append_deal_event('cc000000-0000-0000-0000-0000000000d1', 'deal',
  'cc000000-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('cc-team'), 'firm_id', tests.create_firm(tests.account_id('cc-team')), 'owner_user_id', tests.get_uid('cc_owner'),
    'description', 'Comment deal'), null, 'service');
select public.append_deal_event('cc000000-0000-0000-0000-0000000000d2', 'deal',
  'cc000000-0000-0000-0000-0000000000d2', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('cc-other'), 'firm_id', tests.create_firm(tests.account_id('cc-other')), 'owner_user_id', tests.get_uid('cc_other_owner'),
    'description', 'Other team deal'), null, 'service');

reset role;

insert into public.accounts_memberships (user_id, account_id, account_role)
values (tests.get_uid('cc_member'), tests.account_id('cc-team'), 'viewer');

insert into public.deal_counsel (account_id, deal_id, side, user_id, email)
values
  (tests.account_id('cc-team'), 'cc000000-0000-0000-0000-0000000000d1', 'buyer',
    tests.get_uid('cc_buyer_law'), 'cc_buyer_law@opendealbook.test'),
  (tests.account_id('cc-team'), 'cc000000-0000-0000-0000-0000000000d1', 'seller',
    tests.get_uid('cc_seller_law'), 'cc_seller_law@opendealbook.test');

insert into public.contract (id, deal_id, account_id, type)
values
  ('cc000000-0000-0000-0000-0000000000c1', 'cc000000-0000-0000-0000-0000000000d1', tests.account_id('cc-team'), 'apa'),
  ('cc000000-0000-0000-0000-0000000000c2', 'cc000000-0000-0000-0000-0000000000d2', tests.account_id('cc-other'), 'apa');

insert into public.contract_version (id, contract_id, account_id, version, source, party, shared_at)
values
  ('cc000000-0000-0000-0000-0000000000a1', 'cc000000-0000-0000-0000-0000000000c1', tests.account_id('cc-team'), 1, 'upload', 'buyer', null),
  ('cc000000-0000-0000-0000-0000000000a2', 'cc000000-0000-0000-0000-0000000000c1', tests.account_id('cc-team'), 2, 'upload', 'buyer', now()),
  ('cc000000-0000-0000-0000-0000000000a3', 'cc000000-0000-0000-0000-0000000000c1', tests.account_id('cc-team'), 3, 'upload', 'seller', null),
  ('cc000000-0000-0000-0000-0000000000a9', 'cc000000-0000-0000-0000-0000000000c2', tests.account_id('cc-other'), 1, 'upload', 'buyer', null);

-- ---- The team comments ----
select tests.login_as('cc_owner');

select lives_ok(
  $$ insert into public.contract_comment (id, account_id, contract_version_id, author_user_id, author_side, quoted_text, body)
     values ('cc000000-0000-0000-0000-0000000000e1', tests.account_id('cc-team'), 'cc000000-0000-0000-0000-0000000000a2',
       tests.get_uid('cc_owner'), 'buyer', 'Purchase price', 'Price needs to drop') $$,
  'a deal manager comments on a version, quoting its text'
);
select lives_ok(
  $$ insert into public.contract_comment (id, account_id, contract_version_id, author_user_id, author_side, body, internal)
     values ('cc000000-0000-0000-0000-0000000000e2', tests.account_id('cc-team'), 'cc000000-0000-0000-0000-0000000000a2',
       tests.get_uid('cc_owner'), 'buyer', 'Our walk-away is 2.1M', true) $$,
  'a deal manager marks a comment internal'
);
select lives_ok(
  $$ insert into public.contract_comment (id, account_id, contract_version_id, author_user_id, author_side, body)
     values ('cc000000-0000-0000-0000-0000000000e3', tests.account_id('cc-team'), 'cc000000-0000-0000-0000-0000000000a1',
       tests.get_uid('cc_owner'), 'buyer', 'Draft note') $$,
  'a deal manager comments on an internal draft'
);
select throws_ok(
  $$ insert into public.contract_comment (account_id, contract_version_id, author_user_id, author_side, body)
     values (tests.account_id('cc-team'), 'cc000000-0000-0000-0000-0000000000a2',
       tests.get_uid('cc_owner'), 'seller', 'Posing as the seller') $$,
  '42501', null, 'the team only ever comments as the buyer side'
);
select throws_ok(
  $$ insert into public.contract_comment (account_id, contract_version_id, author_user_id, author_side, body)
     values (tests.account_id('cc-team'), 'cc000000-0000-0000-0000-0000000000a2',
       tests.get_uid('cc_member'), 'buyer', 'In someone else''s name') $$,
  '42501', null, 'nobody comments in someone else''s name'
);
select throws_ok(
  $$ insert into public.contract_comment (account_id, contract_version_id, author_user_id, author_side, body)
     values (tests.account_id('cc-team'), 'cc000000-0000-0000-0000-0000000000a9',
       tests.get_uid('cc_owner'), 'buyer', 'On another team''s contract') $$,
  '42501', 'rows cannot link across teams', 'a comment cannot hang off another team''s version'
);

-- ---- Replies ----
select lives_ok(
  $$ insert into public.contract_comment (id, account_id, contract_version_id, parent_id, author_user_id, author_side, body)
     values ('cc000000-0000-0000-0000-0000000000e4', tests.account_id('cc-team'), 'cc000000-0000-0000-0000-0000000000a2',
       'cc000000-0000-0000-0000-0000000000e1', tests.get_uid('cc_owner'), 'buyer', 'Agreed') $$,
  'a reply threads under its parent'
);
select throws_ok(
  $$ insert into public.contract_comment (account_id, contract_version_id, parent_id, author_user_id, author_side, body)
     values (tests.account_id('cc-team'), 'cc000000-0000-0000-0000-0000000000a1',
       'cc000000-0000-0000-0000-0000000000e1', tests.get_uid('cc_owner'), 'buyer', 'Wrong version') $$,
  '23503', null, 'a reply sits on the same version as its parent'
);
select throws_ok(
  $$ insert into public.contract_comment (account_id, contract_version_id, parent_id, author_user_id, author_side, body)
     values (tests.account_id('cc-team'), 'cc000000-0000-0000-0000-0000000000a2',
       'cc000000-0000-0000-0000-0000000000e4', tests.get_uid('cc_owner'), 'buyer', 'Reply to a reply') $$,
  'P0001', 'You can only reply to a top-level comment.', 'a reply cannot be replied to'
);

-- ---- Resolving ----
select lives_ok(
  $$ update public.contract_comment set resolved_at = now() where id = 'cc000000-0000-0000-0000-0000000000e1' $$,
  'a deal manager resolves a comment'
);
select isnt(
  (select resolved_at from public.contract_comment where id = 'cc000000-0000-0000-0000-0000000000e1'),
  null,
  'the comment is resolved'
);
select throws_ok(
  $$ update public.contract_comment set body = 'Rewritten' where id = 'cc000000-0000-0000-0000-0000000000e1' $$,
  '42501', null, 'a posted comment''s text never changes'
);

-- ---- Team members who do not manage the deal ----
select tests.login_as('cc_member');

select results_eq(
  $$ select id from public.contract_comment order by id $$,
  $$ values ('cc000000-0000-0000-0000-0000000000e1'::uuid), ('cc000000-0000-0000-0000-0000000000e2'::uuid),
            ('cc000000-0000-0000-0000-0000000000e3'::uuid), ('cc000000-0000-0000-0000-0000000000e4'::uuid) $$,
  'every team member reads every comment, internal ones included'
);
select throws_ok(
  $$ insert into public.contract_comment (account_id, contract_version_id, author_user_id, author_side, body)
     values (tests.account_id('cc-team'), 'cc000000-0000-0000-0000-0000000000a2',
       tests.get_uid('cc_member'), 'buyer', 'Without deals.work') $$,
  '42501', null, 'a read-only team member cannot comment'
);

-- ---- Counsel writes go through the server, so the side rule lives in the table ----
reset role;

select throws_ok(
  $$ insert into public.contract_comment (account_id, contract_version_id, author_user_id, author_side, body, internal)
     values (tests.account_id('cc-team'), 'cc000000-0000-0000-0000-0000000000a2',
       tests.get_uid('cc_seller_law'), 'seller', 'Hidden from the buyer', true) $$,
  '23514', null, 'only the buyer side marks a comment internal'
);
insert into public.contract_comment (id, account_id, contract_version_id, author_user_id, author_side, body)
values ('cc000000-0000-0000-0000-0000000000e5', tests.account_id('cc-team'), 'cc000000-0000-0000-0000-0000000000a2',
  tests.get_uid('cc_seller_law'), 'seller', 'Seller pushes back');

-- e6 was written on v2 before the team shared it; e7 on the seller's own v3.
insert into public.contract_comment (id, account_id, contract_version_id, author_user_id, author_side, body, created_at)
values
  ('cc000000-0000-0000-0000-0000000000e6', tests.account_id('cc-team'), 'cc000000-0000-0000-0000-0000000000a2',
    tests.get_uid('cc_owner'), 'buyer', 'Before we shared it', now() - interval '1 day'),
  ('cc000000-0000-0000-0000-0000000000e7', tests.account_id('cc-team'), 'cc000000-0000-0000-0000-0000000000a3',
    tests.get_uid('cc_owner'), 'buyer', 'On the seller draft', now() - interval '2 days');
-- ea replies today to e6, which the seller side cannot read.
insert into public.contract_comment (id, account_id, contract_version_id, parent_id, author_user_id, author_side, body)
values ('cc000000-0000-0000-0000-0000000000ea', tests.account_id('cc-team'), 'cc000000-0000-0000-0000-0000000000a2',
  'cc000000-0000-0000-0000-0000000000e6', tests.get_uid('cc_owner'), 'buyer', 'Still true after sharing');

select throws_ok(
  $$ insert into public.contract_comment (account_id, contract_version_id, parent_id, author_user_id, author_side, body)
     values (tests.account_id('cc-team'), 'cc000000-0000-0000-0000-0000000000a2',
       'cc000000-0000-0000-0000-0000000000e2', tests.get_uid('cc_buyer_law'), 'buyer', 'Shared reply') $$,
  'P0001', 'A reply to an internal comment is internal', 'a reply to an internal comment cannot be shared'
);
select lives_ok(
  $$ insert into public.contract_comment (account_id, contract_version_id, parent_id, author_user_id, author_side, body, internal)
     values (tests.account_id('cc-team'), 'cc000000-0000-0000-0000-0000000000a2',
       'cc000000-0000-0000-0000-0000000000e2', tests.get_uid('cc_buyer_law'), 'buyer', 'Internal reply', true) $$,
  'a reply to an internal comment is internal'
);
delete from public.contract_comment where body = 'Internal reply';

select tests.login_as('cc_owner');

update public.contract_comment set resolved_at = now() where id = 'cc000000-0000-0000-0000-0000000000e5';

select is(
  (select resolved_at from public.contract_comment where id = 'cc000000-0000-0000-0000-0000000000e5'),
  null,
  'the team cannot resolve a seller-side comment'
);

-- ---- Who reads what ----
select tests.login_as('cc_buyer_law');

select results_eq(
  $$ select id from public.contract_comment order by id $$,
  $$ values ('cc000000-0000-0000-0000-0000000000e1'::uuid), ('cc000000-0000-0000-0000-0000000000e2'::uuid),
            ('cc000000-0000-0000-0000-0000000000e3'::uuid), ('cc000000-0000-0000-0000-0000000000e4'::uuid),
            ('cc000000-0000-0000-0000-0000000000e5'::uuid), ('cc000000-0000-0000-0000-0000000000e6'::uuid),
            ('cc000000-0000-0000-0000-0000000000e7'::uuid), ('cc000000-0000-0000-0000-0000000000ea'::uuid) $$,
  'buyer''s counsel read every comment, internal ones included'
);

select tests.login_as('cc_seller_law');

select results_eq(
  $$ select id from public.contract_comment order by id $$,
  $$ values ('cc000000-0000-0000-0000-0000000000e1'::uuid), ('cc000000-0000-0000-0000-0000000000e4'::uuid),
            ('cc000000-0000-0000-0000-0000000000e5'::uuid), ('cc000000-0000-0000-0000-0000000000e7'::uuid) $$,
  'seller''s counsel read shared comments posted since a version was shared, and all on seller versions, but no reply in a thread they cannot read'
);

select tests.login_as('cc_stranger');

select is_empty(
  $$ select 1 from public.contract_comment $$,
  'someone outside the deal reads no comments'
);

select tests.login_as('cc_other_owner');

select is_empty(
  $$ select 1 from public.contract_comment $$,
  'another team reads no comments'
);

-- ---- Who wrote each comment ----
-- cc_seller is in the seller room. Dana Lee gave her name as counsel;
-- cc_seller_law gave none, so their account name stands.
select tests.create_user('cc_seller');
select tests.login_as('cc_owner');
select public.ensure_seller_room('cc000000-0000-0000-0000-0000000000d1');

reset role;
insert into public.seller_room_member (room_id, user_id, email, name)
select r.id, tests.get_uid('cc_seller'), 'cc_seller@opendealbook.test', 'Sam Seller'
from public.seller_room r where r.deal_id = 'cc000000-0000-0000-0000-0000000000d1';
update public.accounts set name = 'Olive Owner'
where primary_owner_user_id = tests.get_uid('cc_owner') and is_personal_account;
update public.accounts set name = 'Sid Law'
where primary_owner_user_id = tests.get_uid('cc_seller_law') and is_personal_account;
update public.deal_counsel set name = 'Dana Lee' where user_id = tests.get_uid('cc_buyer_law');
insert into public.contract_comment (id, account_id, contract_version_id, author_user_id, author_side, body, internal)
values
  ('cc000000-0000-0000-0000-0000000000e8', tests.account_id('cc-team'), 'cc000000-0000-0000-0000-0000000000a3',
    tests.get_uid('cc_seller'), 'seller', 'From the seller', false),
  ('cc000000-0000-0000-0000-0000000000e9', tests.account_id('cc-team'), 'cc000000-0000-0000-0000-0000000000a2',
    tests.get_uid('cc_buyer_law'), 'buyer', 'From buyer''s counsel', false);

select tests.login_as('cc_buyer_law');

select results_eq(
  $$ select comment_id, author_name, author_role
     from public.contract_comment_authors(array['cc000000-0000-0000-0000-0000000000a2'::uuid,
       'cc000000-0000-0000-0000-0000000000a3'::uuid])
     where comment_id in ('cc000000-0000-0000-0000-0000000000e1', 'cc000000-0000-0000-0000-0000000000e5',
       'cc000000-0000-0000-0000-0000000000e8', 'cc000000-0000-0000-0000-0000000000e9')
     order by comment_id $$,
  $$ values ('cc000000-0000-0000-0000-0000000000e1'::uuid, 'Olive Owner', 'team'),
            ('cc000000-0000-0000-0000-0000000000e5'::uuid, 'Sid Law', 'seller_counsel'),
            ('cc000000-0000-0000-0000-0000000000e8'::uuid, 'Sam Seller', 'seller'),
            ('cc000000-0000-0000-0000-0000000000e9'::uuid, 'Dana Lee', 'buyer_counsel') $$,
  'each author is named with their role on the deal'
);

select tests.login_as('cc_seller_law');

select results_eq(
  $$ select comment_id from public.contract_comment_authors(array['cc000000-0000-0000-0000-0000000000a1'::uuid,
       'cc000000-0000-0000-0000-0000000000a2'::uuid, 'cc000000-0000-0000-0000-0000000000a3'::uuid])
     order by comment_id $$,
  $$ select id from public.contract_comment order by id $$,
  'seller''s counsel learn authors only of the comments they can read'
);

select tests.login_as('cc_seller');

select results_eq(
  $$ select comment_id from public.contract_comment_authors(array['cc000000-0000-0000-0000-0000000000a1'::uuid,
       'cc000000-0000-0000-0000-0000000000a2'::uuid, 'cc000000-0000-0000-0000-0000000000a3'::uuid])
     order by comment_id $$,
  $$ select id from public.contract_comment order by id $$,
  'a seller learns authors only of the comments they can read'
);

select tests.login_as('cc_member');

select results_eq(
  $$ select comment_id from public.contract_comment_authors(array['cc000000-0000-0000-0000-0000000000a1'::uuid,
       'cc000000-0000-0000-0000-0000000000a2'::uuid, 'cc000000-0000-0000-0000-0000000000a3'::uuid])
     order by comment_id $$,
  $$ select id from public.contract_comment order by id $$,
  'a team member learns the author of every comment'
);

select tests.login_as('cc_stranger');

select is_empty(
  $$ select 1 from public.contract_comment_authors(array['cc000000-0000-0000-0000-0000000000a1'::uuid,
       'cc000000-0000-0000-0000-0000000000a2'::uuid, 'cc000000-0000-0000-0000-0000000000a3'::uuid]) $$,
  'someone outside the deal learns no authors'
);

reset role;
delete from public.deal_counsel where user_id = tests.get_uid('cc_seller_law');

select tests.login_as('cc_seller_law');

select is_empty(
  $$ select 1 from public.contract_comment $$,
  'removed counsel read no comments, even their own'
);

-- ---- Billing lock ----
reset role;
update public.accounts set trial_ends_at = now() - interval '1 day'
where id = tests.account_id('cc-team');

select tests.login_as('cc_owner');

select throws_ok(
  $$ insert into public.contract_comment (account_id, contract_version_id, author_user_id, author_side, body)
     values (tests.account_id('cc-team'), 'cc000000-0000-0000-0000-0000000000a2',
       tests.get_uid('cc_owner'), 'buyer', 'While locked') $$,
  '42501', 'team is read-only', 'a locked team cannot comment'
);
select throws_ok(
  $$ update public.contract_comment set resolved_at = null where id = 'cc000000-0000-0000-0000-0000000000e1' $$,
  '42501', 'team is read-only', 'a locked team cannot resolve or reopen a comment'
);

select * from finish();
rollback;
