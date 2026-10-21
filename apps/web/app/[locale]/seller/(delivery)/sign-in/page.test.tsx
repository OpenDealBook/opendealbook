import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./actions', () => ({ requestSellerSignInLink: vi.fn() }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('not found');
  },
}));

import SellerSignInPage from './page';

async function markup() {
  return renderToStaticMarkup(
    await SellerSignInPage({ searchParams: Promise.resolve({}) }),
  );
}

describe('the seller sign-in page', () => {
  it('signs a seller in to their rooms list when no destination is given', async () => {
    expect(await markup()).toContain('name="next" value="/seller"');
  });

  it('speaks of the room, never a document', async () => {
    const words = (await markup())
      .replace(/<script[\s\S]*<\/script>/, '')
      .replace(/<[^>]+>/g, ' ');

    expect(words).toMatch(/room/);
    expect(words).not.toMatch(/document/i);
  });
});
