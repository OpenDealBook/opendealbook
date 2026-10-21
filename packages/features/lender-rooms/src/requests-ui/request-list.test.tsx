// @vitest-environment jsdom
import './test-support/mocks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RequestList } from './request-list';
import { clearScreen, show } from './test-support/screen';

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(clearScreen);

describe('a request title that may be cut short', () => {
  it('exposes the full title as a tooltip', () => {
    const title =
      'Three years of operating statements with monthly rent rolls and occupancy';
    show(
      <RequestList
        rows={[
          {
            id: 'ask-1',
            title,
            status: 'open',
            return_route: null,
            latest_signature_status: null,
            last_activity_at: '2026-10-19T12:00:00.000Z',
          },
        ]}
        hrefFor={(id) => `/requests/${id}`}
        dealName={'Harborview Medical Office Portfolio'}
      />,
    );

    const titled = [...document.querySelectorAll('[title]')].find(
      (element) => element.textContent === title,
    );

    expect(titled?.getAttribute('title')).toBe(title);
  });
});
