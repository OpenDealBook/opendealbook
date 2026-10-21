import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./actions', () => ({ requestCounselSignInLink: vi.fn() }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('not found');
  },
}));

import CounselSignInPage from './page';

async function markup() {
  return renderToStaticMarkup(
    await CounselSignInPage({ searchParams: Promise.resolve({}) }),
  );
}

describe('the counsel sign-in page', () => {
  it('signs counsel in to their deals list when no destination is given', async () => {
    expect(await markup()).toContain('name="next" value="/counsel"');
  });
});
