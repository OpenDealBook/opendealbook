import { expect } from '@playwright/test';

import { SUPABASE_URL, serviceHeaders } from './stack';

async function rest<Body>(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<Body> {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: { ...serviceHeaders, Prefer: 'return=representation' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  expect(response.ok, `${method} ${path}: ${text}`).toBe(true);
  return JSON.parse(text || 'null');
}

export function rows<Row>(table: string, query: string): Promise<Row[]> {
  return rest('GET', `/rest/v1/${table}?${query}`);
}

export function insert<Row>(table: string, values: object): Promise<Row[]> {
  return rest('POST', `/rest/v1/${table}`, values);
}

export function remove(table: string, query: string): Promise<unknown> {
  return rest('DELETE', `/rest/v1/${table}?${query}`);
}

export function rpc<Result>(fn: string, args: object): Promise<Result> {
  return rest('POST', `/rest/v1/rpc/${fn}`, args);
}

export async function waitForRow<Row>(
  table: string,
  query: string,
  { timeout = 20_000 }: { timeout?: number } = {},
): Promise<Row> {
  let found: Row[] = [];

  await expect
    .poll(async () => (found = await rows<Row>(table, query)).length, {
      message: `a ${table} row matching ${query}`,
      timeout,
    })
    .toBeGreaterThan(0);

  return found[0]!;
}

export async function userIdByEmail(email: string): Promise<string> {
  const [account, ...others] = await rows<{ primary_owner_user_id: string }>(
    'accounts',
    `email=eq.${encodeURIComponent(email)}&is_personal_account=eq.true&select=primary_owner_user_id`,
  );
  expect(others, `one personal account for ${email}`).toHaveLength(0);
  expect(account, `a personal account for ${email}`).toBeDefined();
  return account!.primary_owner_user_id;
}
