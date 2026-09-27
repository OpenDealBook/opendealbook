-- One-time purchases for an account and their line items.

create table if not exists public.orders (
  id text primary key,
  account_id uuid not null references public.accounts (id) on delete cascade,
  billing_customer_id bigint not null references public.billing_customers on delete cascade,
  status public.payment_status not null,
  billing_provider public.billing_provider not null,
  total_amount numeric not null,
  currency varchar(3) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders enable row level security;

create index ix_orders_account on public.orders (account_id);

revoke all on public.orders from authenticated, service_role;
grant select on public.orders to authenticated;
grant select, insert, update, delete on public.orders to service_role;

create trigger orders_timestamps
  before insert or update on public.orders
  for each row execute function public.set_timestamps();

create policy orders_read on public.orders
  for select to authenticated
  using (
    (account_id = (select auth.uid()) and public.is_set('enable_account_billing'))
    or (public.has_permission((select auth.uid()), account_id, 'billing.manage')
        and public.is_set('enable_team_account_billing'))
  );

create table if not exists public.order_items (
  id text primary key,
  order_id text not null references public.orders (id) on delete cascade,
  product_id text not null,
  variant_id text not null,
  price_amount numeric,
  quantity integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, product_id, variant_id)
);

alter table public.order_items enable row level security;

create index ix_order_items_order on public.order_items (order_id);

revoke all on public.order_items from authenticated, service_role;
grant select on public.order_items to authenticated;
grant select, insert, update, delete on public.order_items to service_role;

create trigger order_items_timestamps
  before insert or update on public.order_items
  for each row execute function public.set_timestamps();

create policy order_items_read on public.order_items
  for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (o.account_id = (select auth.uid())
             or public.has_permission((select auth.uid()), o.account_id, 'billing.manage'))
    )
  );

-- Upsert an order and reconcile its line items from a billing webhook.
create or replace function public.upsert_order(
  target_account_id uuid,
  target_customer_id text,
  target_order_id text,
  status public.payment_status,
  billing_provider public.billing_provider,
  total_amount numeric,
  currency varchar(3),
  line_items jsonb
) returns public.orders
  language plpgsql security definer
  set search_path = '' as $$
declare
  customer_row_id bigint;
  result public.orders;
begin
  insert into public.billing_customers (account_id, provider, customer_id)
  values (target_account_id, billing_provider, target_customer_id)
  on conflict (account_id, provider, customer_id) do update
    set provider = excluded.provider
  returning id into customer_row_id;

  insert into public.orders (
    id, account_id, billing_customer_id, status, billing_provider, total_amount, currency
  )
  values (
    target_order_id, target_account_id, customer_row_id, status, billing_provider, total_amount, currency
  )
  on conflict (id) do update set
    status = excluded.status,
    total_amount = excluded.total_amount,
    currency = excluded.currency
  returning * into result;

  delete from public.order_items
  where order_id = result.id
    and id not in (select item ->> 'id' from jsonb_array_elements(line_items) as item);

  insert into public.order_items (id, order_id, product_id, variant_id, price_amount, quantity)
  select
    item ->> 'id',
    result.id,
    item ->> 'product_id',
    item ->> 'variant_id',
    (item ->> 'price_amount')::numeric,
    (item ->> 'quantity')::integer
  from jsonb_array_elements(line_items) as item
  on conflict (id) do update set
    product_id = excluded.product_id,
    variant_id = excluded.variant_id,
    price_amount = excluded.price_amount,
    quantity = excluded.quantity;

  return result;
end;
$$;

grant execute on function public.upsert_order(
  uuid, text, text, public.payment_status, public.billing_provider, numeric, varchar, jsonb
) to service_role;
