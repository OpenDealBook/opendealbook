-- Recurring subscription state for an account and its priced line items.

create table if not exists public.subscriptions (
  id text primary key,
  account_id uuid not null references public.accounts (id) on delete cascade,
  billing_customer_id bigint not null references public.billing_customers on delete cascade,
  status public.subscription_status not null,
  active boolean not null,
  billing_provider public.billing_provider not null,
  cancel_at_period_end boolean not null,
  currency varchar(3) not null,
  period_starts_at timestamptz not null,
  period_ends_at timestamptz not null,
  trial_starts_at timestamptz,
  trial_ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

create index ix_subscriptions_account on public.subscriptions (account_id);

revoke all on public.subscriptions from authenticated, service_role;
grant select on public.subscriptions to authenticated;
grant select, insert, update, delete on public.subscriptions to service_role;

create trigger subscriptions_timestamps
  before insert or update on public.subscriptions
  for each row execute function public.set_timestamps();

create policy subscriptions_read on public.subscriptions
  for select to authenticated
  using (
    (account_id = (select auth.uid()) and public.is_set('enable_account_billing'))
    or (public.has_permission((select auth.uid()), account_id, 'billing.manage')
        and public.is_set('enable_team_account_billing'))
  );

create table if not exists public.subscription_items (
  id varchar(255) primary key,
  subscription_id text not null references public.subscriptions (id) on delete cascade,
  product_id varchar(255) not null,
  variant_id varchar(255) not null,
  type public.subscription_item_type not null,
  price_amount numeric,
  quantity integer not null default 1,
  interval varchar(255) not null,
  interval_count integer not null check (interval_count > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subscription_id, product_id, variant_id)
);

alter table public.subscription_items enable row level security;

create index ix_subscription_items_subscription on public.subscription_items (subscription_id);

revoke all on public.subscription_items from authenticated, service_role;
grant select on public.subscription_items to authenticated;
grant select, insert, update, delete on public.subscription_items to service_role;

create trigger subscription_items_timestamps
  before insert or update on public.subscription_items
  for each row execute function public.set_timestamps();

create policy subscription_items_read on public.subscription_items
  for select to authenticated
  using (
    exists (
      select 1 from public.subscriptions s
      where s.id = subscription_id
        and (s.account_id = (select auth.uid())
             or public.has_permission((select auth.uid()), s.account_id, 'billing.manage'))
    )
  );

create or replace function public.has_active_subscription(target_account_id uuid)
  returns boolean
  language sql
  set search_path = '' as $$
  select exists (
    select 1 from public.subscriptions
    where account_id = target_account_id and active
  );
$$;

grant execute on function public.has_active_subscription(uuid) to authenticated, service_role;

-- Upsert a subscription and reconcile its line items from a billing webhook.
create or replace function public.upsert_subscription(
  target_account_id uuid,
  target_customer_id text,
  target_subscription_id text,
  active boolean,
  status public.subscription_status,
  billing_provider public.billing_provider,
  cancel_at_period_end boolean,
  currency varchar(3),
  period_starts_at timestamptz,
  period_ends_at timestamptz,
  line_items jsonb,
  trial_starts_at timestamptz default null,
  trial_ends_at timestamptz default null
) returns public.subscriptions
  language plpgsql security definer
  set search_path = '' as $$
declare
  customer_row_id bigint;
  result public.subscriptions;
begin
  insert into public.billing_customers (account_id, provider, customer_id)
  values (target_account_id, billing_provider, target_customer_id)
  on conflict (account_id, provider, customer_id) do update
    set provider = excluded.provider
  returning id into customer_row_id;

  insert into public.subscriptions (
    id, account_id, billing_customer_id, status, active, billing_provider,
    cancel_at_period_end, currency, period_starts_at, period_ends_at,
    trial_starts_at, trial_ends_at
  )
  values (
    target_subscription_id, target_account_id, customer_row_id, status, active, billing_provider,
    cancel_at_period_end, currency, period_starts_at, period_ends_at,
    trial_starts_at, trial_ends_at
  )
  on conflict (id) do update set
    status = excluded.status,
    active = excluded.active,
    cancel_at_period_end = excluded.cancel_at_period_end,
    currency = excluded.currency,
    period_starts_at = excluded.period_starts_at,
    period_ends_at = excluded.period_ends_at,
    trial_starts_at = excluded.trial_starts_at,
    trial_ends_at = excluded.trial_ends_at
  returning * into result;

  delete from public.subscription_items
  where subscription_id = result.id
    and id not in (select item ->> 'id' from jsonb_array_elements(line_items) as item);

  insert into public.subscription_items (
    id, subscription_id, product_id, variant_id, type, price_amount, quantity, interval, interval_count
  )
  select
    item ->> 'id',
    result.id,
    item ->> 'product_id',
    item ->> 'variant_id',
    (item ->> 'type')::public.subscription_item_type,
    (item ->> 'price_amount')::numeric,
    (item ->> 'quantity')::integer,
    item ->> 'interval',
    (item ->> 'interval_count')::integer
  from jsonb_array_elements(line_items) as item
  on conflict (id) do update set
    product_id = excluded.product_id,
    variant_id = excluded.variant_id,
    type = excluded.type,
    price_amount = excluded.price_amount,
    quantity = excluded.quantity,
    interval = excluded.interval,
    interval_count = excluded.interval_count;

  return result;
end;
$$;

grant execute on function public.upsert_subscription(
  uuid, text, text, boolean, public.subscription_status, public.billing_provider,
  boolean, varchar, timestamptz, timestamptz, jsonb, timestamptz, timestamptz
) to service_role;
