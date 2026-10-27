import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import messages from '../../../messages/en.json';

const rpc = vi.hoisted(() => vi.fn());

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerAdminClient: () => ({ rpc }),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: async ({ namespace }: { namespace: string }) => (key: string) =>
    `${namespace}.${key}`
      .split('.')
      .reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], messages),
}));

import UnsubscribePage from './page';

const copy = messages.common.unsubscribe;

async function render(searchParams: { token?: string; status?: string }) {
  return renderToStaticMarkup(
    await UnsubscribePage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve(searchParams),
    }),
  );
}

describe('UnsubscribePage', () => {
  it('offers an Unsubscribe button without opting anyone out on open', async () => {
    const html = await render({ token: 'live-token' });

    expect(html).toContain('<form');
    expect(html).toContain(copy.prompt);
    expect(html).toContain(`${copy.button}</button>`);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('confirms once the opt-out is recorded', async () => {
    const html = await render({ status: 'done' });

    expect(html).toContain(copy.done);
    expect(html).not.toContain('<form');
  });

  it('says the link is not valid when the token matched nothing', async () => {
    const html = await render({ status: 'invalid' });

    expect(html).toContain(copy.invalid);
    expect(html).not.toContain('<form');
  });

  it('says the link is not valid and shows no form when the link has no token', async () => {
    const html = await render({});

    expect(html).toContain(copy.invalid);
    expect(html).not.toContain('<form');
  });
});
