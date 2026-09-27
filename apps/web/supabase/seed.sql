-- Minimal local seed: two confirmed users (password: password123), whose
-- personal accounts are created by the on_auth_user_created trigger, plus one
-- team owned by the first user with the second user invited.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '11111111-1111-1111-1111-111111111111',
    'authenticated', 'authenticated', 'owner@tuckin.test',
    extensions.crypt('password123', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{"name":"Ada Owner"}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '22222222-2222-2222-2222-222222222222',
    'authenticated', 'authenticated', 'member@tuckin.test',
    extensions.crypt('password123', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{"name":"Ben Member"}', now(), now()
  );

select public.create_team_account('Tuckin HQ', '11111111-1111-1111-1111-111111111111', 'tuckin-hq');

insert into public.accounts_memberships (account_id, user_id, account_role)
select id, '22222222-2222-2222-2222-222222222222', 'member'
from public.accounts where slug = 'tuckin-hq';
