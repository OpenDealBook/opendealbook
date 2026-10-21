// @vitest-environment jsdom
import { act } from 'react';

import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, expect, it } from 'vitest';

import { clearScreen } from './lender-test-kit';
import { SavedAt } from './saved-at';

const iso = new Date(2026, 9, 20, 15, 14).toISOString();

afterEach(clearScreen);

it('leaves the time out of the server render and fills it in local time on hydration, without a mismatch', async () => {
  const html = renderToString(<SavedAt iso={iso} />);

  expect(html).not.toContain('3:14');

  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.append(container);
  const errors: unknown[] = [];

  await act(async () => {
    hydrateRoot(container, <SavedAt iso={iso} />, {
      onRecoverableError: (error) => errors.push(error),
    });
  });

  expect(errors).toEqual([]);
  expect(container.querySelector('time')?.getAttribute('datetime')).toBe(iso);
  expect(container.textContent).toBe('Oct 20 3:14 PM');
  container.remove();
});
