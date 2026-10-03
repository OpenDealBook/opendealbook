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

-- Placeholder LOI and APA templates so the contract-generation pipeline has a
-- document_template to render from. The language is deliberately minimal and
-- clearly marked placeholder; the pipeline stays dark until real template
-- content and Documenso config land, since docx_path points at a file that is
-- not uploaded yet.
insert into public.document_template (account_id, name, type, docx_path, version)
select id, 'PLACEHOLDER LOI - replace with real language', 'loi', 'placeholder/loi.docx', 1
from public.accounts where slug = 'tuckin-hq'
union all
select id, 'PLACEHOLDER APA - replace with real language', 'apa', 'placeholder/apa.docx', 1
from public.accounts where slug = 'tuckin-hq';
