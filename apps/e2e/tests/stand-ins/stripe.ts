import { notFound, type Handler, type StandInResponse } from './http';

import { createHmac } from 'node:crypto';

type Form = { [key: string]: string | Form };

function parseForm(body: string): Form {
  const form: Form = {};

  for (const [key, value] of new URLSearchParams(body)) {
    const path = key.replace(/\]/g, '').split('[');
    let node = form;
    for (const segment of path.slice(0, -1)) {
      const next = node[segment];
      node = typeof next === 'object' ? next : (node[segment] = {});
    }
    node[path.at(-1)!] = value;
  }

  return form;
}

function field(form: Form, ...path: string[]): string | undefined {
  let node: string | Form | undefined = form;
  for (const segment of path) {
    node = typeof node === 'object' ? node[segment] : undefined;
  }
  return typeof node === 'string' ? node : undefined;
}

function signature(secret: string, payload: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const digest = createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');
  return `t=${timestamp},v1=${digest}`;
}

interface CheckoutSession {
  id: string;
  object: 'checkout.session';
  client_secret: string;
  status: 'open' | 'complete';
  mode: string | undefined;
  customer: string | null;
  customer_email: string | null;
  client_reference_id: string | null;
  subscription: string | null;
  metadata: Record<string, string>;
  return_url: string | undefined;
  url: null;
}

interface PortalSession {
  id: string;
  object: 'billing_portal.session';
  customer: string;
  return_url: string;
  url: string;
}

type SubscriptionStatus =
  | 'active'
  | 'past_due'
  | 'unpaid'
  | 'incomplete_expired'
  | 'canceled';

interface Subscription {
  id: string;
  object: 'subscription';
  metadata: { accountId: string };
  customer: string;
  status: SubscriptionStatus;
  currency: string;
  cancel_at_period_end: boolean;
  trial_start: null;
  trial_end: null;
  items: {
    object: 'list';
    data: {
      id: string;
      object: 'subscription_item';
      quantity: number;
      current_period_start: number;
      current_period_end: number;
      price: {
        id: string;
        object: 'price';
        product: string;
        recurring: {
          interval: 'month' | 'year';
          interval_count: 1;
          usage_type: 'licensed';
        };
      };
    }[];
  };
}

export interface CompleteCheckout {
  productId: string;
  interval: 'month' | 'year';
}

export function stripeStandIn({
  url,
  webhookUrl,
  webhookSecret,
}: {
  url: string;
  webhookUrl: string;
  webhookSecret: string;
}): Handler {
  let sequence = 0;
  const next = (prefix: string) => `${prefix}_e2e_${++sequence}`;
  const checkoutSessions = new Map<string, CheckoutSession>();
  const checkoutParams = new Map<string, Form>();
  const portalSessions = new Map<string, PortalSession>();
  const subscriptions = new Map<string, Subscription>();
  const requests: { method: string; path: string; params: Form }[] = [];

  async function sendWebhook(type: string, object: unknown) {
    const payload = JSON.stringify({
      id: next('evt'),
      object: 'event',
      api_version: '2025-01-01',
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      type,
      data: { object },
    });
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': signature(webhookSecret, payload),
      },
      body: payload,
    });
    return { status: response.status, body: await response.text() };
  }

  function subscription({
    accountId,
    customer,
    priceId,
    quantity,
    productId,
    interval,
  }: CompleteCheckout & {
    accountId: string;
    customer: string;
    priceId: string;
    quantity: number;
  }): Subscription {
    const now = Math.floor(Date.now() / 1000);
    const created: Subscription = {
      id: next('sub'),
      object: 'subscription',
      metadata: { accountId },
      customer,
      status: 'active',
      currency: 'usd',
      cancel_at_period_end: false,
      trial_start: null,
      trial_end: null,
      items: {
        object: 'list',
        data: [
          {
            id: next('si'),
            object: 'subscription_item',
            quantity,
            current_period_start: now,
            current_period_end: now + (interval === 'year' ? 365 : 30) * 86_400,
            price: {
              id: priceId,
              object: 'price',
              product: productId,
              recurring: {
                interval,
                interval_count: 1,
                usage_type: 'licensed',
              },
            },
          },
        ],
      },
    };
    subscriptions.set(created.id, created);
    return created;
  }

  async function control(
    method: string,
    path: string,
    body: string,
  ): Promise<StandInResponse | undefined> {
    const complete = path.match(
      /^\/__e2e\/checkout-sessions\/([^/]+)\/complete$/,
    );

    if (method === 'POST' && complete) {
      const session = checkoutSessions.get(complete[1]!)!;
      const params = checkoutParams.get(session.id)!;
      const { productId, interval }: CompleteCheckout = JSON.parse(body);
      const customer = session.customer ?? next('cus');
      const created = subscription({
        accountId: session.client_reference_id!,
        customer,
        priceId: field(params, 'line_items', '0', 'price')!,
        quantity: Number(field(params, 'line_items', '0', 'quantity') ?? 1),
        productId,
        interval,
      });
      Object.assign(session, {
        status: 'complete',
        customer,
        subscription: created.id,
      });
      const webhooks = [
        await sendWebhook('checkout.session.completed', session),
        await sendWebhook('customer.subscription.created', created),
      ];
      return {
        status: 200,
        json: { session, subscription: created, webhooks },
      };
    }

    const transition = path.match(/^\/__e2e\/subscriptions\/([^/]+)\/status$/);

    if (method === 'POST' && transition) {
      const found = subscriptions.get(transition[1]!)!;
      const { status }: { status: SubscriptionStatus } = JSON.parse(body);
      found.status = status;
      const webhook = await sendWebhook(
        status === 'canceled'
          ? 'customer.subscription.deleted'
          : 'customer.subscription.updated',
        found,
      );
      return { status: 200, json: { subscription: found, webhook } };
    }

    if (method === 'POST' && path === '/__e2e/webhooks') {
      const { type, object }: { type: string; object: unknown } =
        JSON.parse(body);
      return { status: 200, json: await sendWebhook(type, object) };
    }

    if (method === 'GET' && path === '/__e2e/checkout-sessions') {
      return { status: 200, json: [...checkoutSessions.values()] };
    }

    if (method === 'GET' && path === '/__e2e/requests') {
      return { status: 200, json: requests };
    }

    return undefined;
  }

  function api(
    method: string,
    path: string,
    params: Form,
  ): StandInResponse | undefined {
    if (method === 'POST' && path === '/v1/checkout/sessions') {
      const id = next('cs');
      const session: CheckoutSession = {
        id,
        object: 'checkout.session',
        client_secret: `${id}_secret_e2e`,
        status: 'open',
        mode: field(params, 'mode'),
        customer: field(params, 'customer') ?? null,
        customer_email: field(params, 'customer_email') ?? null,
        client_reference_id: field(params, 'client_reference_id') ?? null,
        subscription: null,
        metadata: {},
        return_url: field(params, 'return_url'),
        url: null,
      };
      checkoutSessions.set(id, session);
      checkoutParams.set(id, params);
      return { status: 200, json: session };
    }

    const checkout = path.match(/^\/v1\/checkout\/sessions\/([^/]+)$/);
    if (method === 'GET' && checkout) {
      const session = checkoutSessions.get(checkout[1]!);
      return session && { status: 200, json: session };
    }

    if (method === 'POST' && path === '/v1/billing_portal/sessions') {
      const id = next('bps');
      const session: PortalSession = {
        id,
        object: 'billing_portal.session',
        customer: field(params, 'customer')!,
        return_url: field(params, 'return_url')!,
        url: `${url}/portal/${id}`,
      };
      portalSessions.set(id, session);
      return { status: 200, json: session };
    }

    const portal = path.match(/^\/portal\/([^/]+)$/);
    if (method === 'GET' && portal && portalSessions.has(portal[1]!)) {
      const session = portalSessions.get(portal[1]!)!;
      return {
        status: 200,
        html: `<!doctype html><title>Stripe portal stand-in</title><h1>Billing portal</h1><a href="${session.return_url}">Return to Open Deal Book</a>`,
      };
    }

    const sub = path.match(/^\/v1\/subscriptions\/([^/]+)$/);
    const found = sub && subscriptions.get(sub[1]!);
    if (!found) {
      return undefined;
    }

    if (method === 'GET') {
      return { status: 200, json: found };
    }

    if (method === 'POST') {
      const item = found.items.data[0]!;
      const quantity = field(params, 'items', '0', 'quantity');
      if (
        quantity !== undefined &&
        field(params, 'items', '0', 'id') === item.id
      ) {
        item.quantity = Number(quantity);
      }
      return { status: 200, json: found };
    }

    if (method === 'DELETE') {
      found.status = 'canceled';
      return { status: 200, json: found };
    }

    return undefined;
  }

  return async (request) => {
    if (request.path.startsWith('/__e2e/')) {
      return (
        (await control(request.method, request.path, request.body)) ??
        notFound(request)
      );
    }

    const params = parseForm(
      request.method === 'GET' ? request.query.toString() : request.body,
    );
    requests.push({ method: request.method, path: request.path, params });

    return (
      api(request.method, request.path, params) ?? {
        status: 404,
        json: {
          error: {
            type: 'invalid_request_error',
            message: `stand-in has no ${request.method} ${request.path}`,
          },
        },
      }
    );
  };
}
