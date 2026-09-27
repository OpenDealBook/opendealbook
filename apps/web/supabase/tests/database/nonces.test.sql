begin;
select no_plan();

select tests.create_user('nonce_owner');
select tests.login_as_service_role();

-- Mint a nonce carrying metadata and scopes, then redeem it once.
create temporary table _minted as
  select public.create_nonce(
    'email-verify',
    tests.get_uid('nonce_owner'),
    null,
    3600,
    '{"invited_by": "alice"}'::jsonb,
    array['profile.read']
  ) as token;

create temporary table _redeemed as
  select public.verify_nonce((select token from _minted), 'email-verify') as res;

select is((select res ->> 'valid' from _redeemed), 'true', 'verify_nonce reports valid on a fresh token');
select is((select res ->> 'purpose' from _redeemed), 'email-verify', 'success payload echoes the purpose');
select is((select res ->> 'user_id' from _redeemed), tests.get_uid('nonce_owner')::text, 'success payload carries the user id');
select is((select res -> 'metadata' ->> 'invited_by' from _redeemed), 'alice', 'success payload carries the metadata');
select is((select res -> 'scopes' ->> 0 from _redeemed), 'profile.read', 'success payload carries the scopes');

-- Re-redeeming the same token now fails: it was consumed above.
select is(
  (public.verify_nonce((select token from _minted), 'email-verify')) ->> 'valid',
  'false',
  'an already used token is no longer valid'
);

-- An unknown token returns the failure shape with a message.
select is(
  (public.verify_nonce('not-a-real-token', 'email-verify')) ->> 'valid',
  'false',
  'an unknown token is not valid'
);
select ok(
  (public.verify_nonce('not-a-real-token', 'email-verify')) ? 'message',
  'the failure payload includes a message'
);

-- A scope the token does not hold is rejected with the scope variant.
create temporary table _scoped as
  select public.create_nonce('email-verify', tests.get_uid('nonce_owner'), null, 3600, '{}'::jsonb, array['profile.read']) as token;

select ok(
  (public.verify_nonce((select token from _scoped), 'email-verify', array['billing.write'])) -> 'required_scopes' is not null,
  'a scope mismatch returns the scope variant'
);

select * from finish();
rollback;
