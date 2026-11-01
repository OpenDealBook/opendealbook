import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';

import { fakeBroker } from '../../../test-support/fake-broker';
import { brokerJson } from './broker';

let broker: Awaited<ReturnType<typeof fakeBroker>>;

beforeAll(async () => {
  broker = await fakeBroker();
  broker.routes.set('GET /searches/s-1', { status: 200, body: { id: 's-1' } });
});

afterAll(() => broker.close());

afterEach(() => {
  delete process.env.ODB_ALLOW_PRIVATE_AI_URL;
  delete process.env.ODB_STACK;
});

const ask = () =>
  brokerJson('Baselayer', {
    url: `${broker.origin}/searches/s-1`,
    headers: {},
  });

it('refuses a private broker address', async () => {
  await expect(ask()).rejects.toThrow('Use a public HTTPS base URL');
  expect(broker.received).toHaveLength(0);
});

it.each(['local', 'e2e'])(
  'reaches a private broker address when private AI URLs are allowed on a %s stack',
  async (stack) => {
    Object.assign(process.env, {
      ODB_ALLOW_PRIVATE_AI_URL: '1',
      ODB_STACK: stack,
    });

    expect(await ask()).toEqual({ id: 's-1' });
  },
);

it('ignores the private AI URL flag on a production stack', async () => {
  Object.assign(process.env, {
    ODB_ALLOW_PRIVATE_AI_URL: '1',
    ODB_STACK: 'production',
  });

  await expect(ask()).rejects.toThrow('Use a public HTTPS base URL');
});
