-- Minimal local seed: two confirmed users (password: password123), whose
-- personal accounts are created by the on_auth_user_created trigger, plus one
-- team owned by the first user with the second user invited. The GoTrue token
-- columns are seeded to '' (not null) and a matching auth.identities row is
-- created per user, so password login works after a fresh reset.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '11111111-1111-1111-1111-111111111111',
    'authenticated', 'authenticated', 'owner@tuckin.test',
    extensions.crypt('password123', extensions.gen_salt('bf')), now(),
    '', '', '', '', '', '', '', '',
    '{"provider":"email","providers":["email"]}', '{"name":"Ada Owner"}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '22222222-2222-2222-2222-222222222222',
    'authenticated', 'authenticated', 'member@tuckin.test',
    extensions.crypt('password123', extensions.gen_salt('bf')), now(),
    '', '', '', '', '', '', '', '',
    '{"provider":"email","providers":["email"]}', '{"name":"Ben Member"}', now(), now()
  )
on conflict (id) do nothing;

insert into auth.identities (
  provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) values
  (
    '11111111-1111-1111-1111-111111111111',
    '11111111-1111-1111-1111-111111111111',
    '{"sub":"11111111-1111-1111-1111-111111111111","email":"owner@tuckin.test","email_verified":true,"phone_verified":false}',
    'email', now(), now(), now()
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    '22222222-2222-2222-2222-222222222222',
    '{"sub":"22222222-2222-2222-2222-222222222222","email":"member@tuckin.test","email_verified":true,"phone_verified":false}',
    'email', now(), now(), now()
  )
on conflict (provider_id, provider) do nothing;

select public.create_team_account('Tuckin HQ', '11111111-1111-1111-1111-111111111111', 'tuckin-hq');

insert into public.accounts_memberships (account_id, user_id, account_role)
select id, '22222222-2222-2222-2222-222222222222', 'member'
from public.accounts where slug = 'tuckin-hq';

-- Mark only the owner's personal account as onboarded; member@tuckin.test and
-- the team account stay at the default false so onboarding can be exercised.
update public.accounts
set onboarded = true
where primary_owner_user_id = '11111111-1111-1111-1111-111111111111'
  and is_personal_account;

-- Sample LOI and APA templates so the contract-generation pipeline has a
-- document_template to render from. The generic, counsel-review-me samples live
-- in packages/templates/fixtures; the real (private) templates are never
-- committed and are uploaded at deploy. docx_path here is a human label only:
-- the engine reads the binary from the `templates` bucket at the key
-- <account_id>/<template_id>/v<version>.docx (see templateDocxPath), so a reset
-- or deploy must upload each sample/real .docx to that key for the row it backs.
insert into public.document_template (account_id, name, type, docx_path, version)
select id, 'Sample LOI - replace with your counsel-reviewed template', 'loi', 'samples/loi-standard.docx', 1
from public.accounts where slug = 'tuckin-hq'
union all
select id, 'Sample APA - replace with your counsel-reviewed template', 'apa', 'samples/apa-short.docx', 1
from public.accounts where slug = 'tuckin-hq';

-- Two default post-close checklist templates per account. Day 0 Takeover groups
-- same-day cutover tasks by functional area; First 90 Days phases a transition
-- plan through due_offset_days. Applied to a deal, each item's due_at anchors to
-- the deal close_date plus its offset (see checklist-actions applyChecklistTemplate).

with day0 as (
  insert into public.checklist_template (account_id, name, kind)
  select id, 'Day 0 Takeover', 'post_close' from public.accounts
  returning id
)
insert into public.checklist_template_item (template_id, category, title, due_offset_days, owner_role, importance, sort_order)
select d.id, v.category, v.title, 0, v.owner_role, v.importance, v.sort_order
from day0 d
cross join (values
  ('Customers', 'Transfer the CRM and customer and vendor contact lists', 'buyer', 'required', 1),
  ('Customers', 'Notify key customers of the ownership change and introduce yourself', 'buyer', 'required', 2),
  ('Employees', 'Meet each employee and confirm who is staying on', 'buyer', 'required', 3),
  ('Employees', 'Extend and sign new offer or at-will employment letters', 'buyer', 'required', 4),
  ('Employees', 'Set up the payroll system and confirm the first pay run', 'buyer', 'required', 5),
  ('Employees', 'Establish employee benefits and complete enrollment', 'buyer', 'nice_to_have', 6),
  ('Financial', 'Open the operating bank account and move balances over', 'buyer', 'required', 7),
  ('Financial', 'Set up merchant and card processing accounts', 'buyer', 'required', 8),
  ('Financial', 'Finalize the accounts receivable and accounts payable handoff', 'buyer', 'required', 9),
  ('Financial', 'Confirm the opening cash position and reconcile day one', 'buyer', 'required', 10),
  ('Legal & Taxes', 'Apply for the federal employer identification number', 'buyer', 'required', 11),
  ('Legal & Taxes', 'Apply for the required business licenses and permits', 'buyer', 'required', 12),
  ('Legal & Taxes', 'Register for state payroll tax and sales tax accounts', 'buyer', 'required', 13),
  ('Legal & Taxes', 'Transfer or re-title vehicles, equipment, and registrations', 'buyer', 'nice_to_have', 14),
  ('Owner Transition', 'Agree the knowledge transfer and training plan with the seller', 'buyer', 'required', 15),
  ('Owner Transition', 'Collect standard operating procedures and tribal knowledge from the seller', 'seller', 'required', 16),
  ('Owner Transition', 'Confirm the seller transition support schedule', 'buyer', 'nice_to_have', 17),
  ('Operations', 'Transfer utilities, phone, internet, and service accounts', 'buyer', 'required', 18),
  ('Operations', 'Transfer the website, domain, email, and social accounts', 'buyer', 'nice_to_have', 19),
  ('Operations', 'Transfer intellectual property, trademarks, and brand assets', 'buyer', 'required', 20),
  ('Operations', 'Arrange business insurance and confirm coverage is active', 'buyer', 'required', 21),
  ('Operations', 'Collect keys, alarm codes, and system passwords', 'buyer', 'required', 22),
  ('Operations', 'Inspect fixed assets and confirm inventory counts', 'buyer', 'nice_to_have', 23)
) as v(category, title, owner_role, importance, sort_order);

with first90 as (
  insert into public.checklist_template (account_id, name, kind)
  select id, 'First 90 Days', 'post_close' from public.accounts
  returning id
)
insert into public.checklist_template_item (template_id, category, title, due_offset_days, owner_role, importance, sort_order)
select f.id, v.category, v.title, v.due_offset_days, 'buyer', v.importance, v.sort_order
from first90 f
cross join (values
  ('Week 1', 'Hold a first all-team meeting and share your early plan', 1, 'required', 1),
  ('Week 1', 'Meet one on one with the key employees', 3, 'required', 2),
  ('Week 1', 'Meet or call the top customers', 5, 'required', 3),
  ('Week 1', 'Meet the key vendors and suppliers', 6, 'nice_to_have', 4),
  ('Week 1', 'Begin reviewing the financial statements and legal documents', 7, 'required', 5),
  ('Weeks 2 to 6', 'Complete a financial deep dive on profit and loss, cash flow, and cost drivers', 14, 'required', 6),
  ('Weeks 2 to 6', 'Define and start tracking the core performance indicators', 18, 'nice_to_have', 7),
  ('Weeks 2 to 6', 'Analyze operations and map the main bottlenecks', 24, 'required', 8),
  ('Weeks 2 to 6', 'Run a customer insight review and gather feedback', 30, 'nice_to_have', 9),
  ('Weeks 2 to 6', 'Review technology and systems and list the gaps', 36, 'nice_to_have', 10),
  ('Weeks 2 to 6', 'Build a retention plan for the key employees', 42, 'required', 11),
  ('Day 45 to Month 2', 'Draft the stabilization roadmap', 45, 'required', 12),
  ('Day 45 to Month 2', 'Analyze profit margins by product and service line', 50, 'nice_to_have', 13),
  ('Day 45 to Month 2', 'Build a rolling cash flow forecast', 55, 'required', 14),
  ('Day 45 to Month 2', 'Document the core standard operating procedures', 60, 'nice_to_have', 15),
  ('Month 3 to Day 90', 'Create an employee development and training plan', 75, 'nice_to_have', 16),
  ('Month 3 to Day 90', 'Optimize sales and marketing and test one growth channel', 82, 'nice_to_have', 17),
  ('Month 3 to Day 90', 'Run the 90 day business review and set the next quarter plan', 90, 'required', 18)
) as v(category, title, due_offset_days, importance, sort_order);
