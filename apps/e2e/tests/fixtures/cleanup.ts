import { expect, type TestInfo } from '@playwright/test';

import { remove, rows } from './db';
import { SUPABASE_URL, serviceHeaders } from './stack';

export type Created =
  | { kind: 'user'; email: string }
  | { kind: 'storage'; bucket: string; prefix: string };

export interface Cleanup {
  track(created: Created): void;
}

async function storage(method: 'POST' | 'DELETE', path: string, body: object) {
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object${path}`, {
    method,
    headers: serviceHeaders,
    body: JSON.stringify(body),
  });
  const text = await response.text();
  expect(response.ok, `${method} storage ${path}: ${text}`).toBe(true);
  return JSON.parse(text);
}

async function removeStorage(bucket: string, prefix: string) {
  const listed: { name: string }[] = await storage('POST', `/list/${bucket}`, {
    prefix,
    limit: 1000,
  });

  if (listed.length > 0) {
    await storage('DELETE', `/${bucket}`, {
      prefixes: listed.map((object) => `${prefix}/${object.name}`),
    });
  }
}

async function removeUsers(emails: string[]) {
  const users = await rows<{ primary_owner_user_id: string; email: string }>(
    'accounts',
    `is_personal_account=eq.true&email=in.(${emails.map(encodeURIComponent).join(',')})&select=primary_owner_user_id,email`,
  );
  expect(users.map((user) => user.email).sort()).toEqual([...emails].sort());
  const ids = users.map((user) => user.primary_owner_user_id).join(',');

  for (const email of emails) {
    await remove(
      'lender_rate_limit',
      `key=like.*${encodeURIComponent(email)}*`,
    );
  }

  // Team accounts go first: other tracked users' rows hang off them.
  await remove(
    'accounts',
    `is_personal_account=eq.false&primary_owner_user_id=in.(${ids})`,
  );
  // Deleting the personal accounts cascades the rows whose created_by and
  // owner_user_id keys would otherwise block deleting the auth users.
  await remove('accounts', `primary_owner_user_id=in.(${ids})`);

  for (const user of users) {
    const response = await fetch(
      `${SUPABASE_URL}/auth/v1/admin/users/${user.primary_owner_user_id}`,
      { method: 'DELETE', headers: serviceHeaders },
    );
    expect(response.ok, `delete auth user ${user.email}`).toBe(true);
  }
}

export async function settle(
  created: Created[],
  testInfo: Pick<TestInfo, 'status' | 'attach'>,
) {
  if (testInfo.status !== 'passed') {
    if (created.length > 0) {
      await testInfo.attach('kept for inspection', {
        body: JSON.stringify(created, null, 2),
        contentType: 'application/json',
      });
    }
    return;
  }

  for (const item of created) {
    if (item.kind === 'storage') {
      await removeStorage(item.bucket, item.prefix);
    }
  }

  const emails = [
    ...new Set(
      created.flatMap((item) => (item.kind === 'user' ? [item.email] : [])),
    ),
  ];

  if (emails.length > 0) {
    await removeUsers(emails);
  }
}
