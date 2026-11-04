import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';

vi.mock('../_components/timezone-detection', () => ({
  TimezoneDetection: () => <span data-detects-time-zone />,
}));

import LenderLayout from './layout';

it('detects the lender time zone around every lender page', () => {
  const markup = renderToStaticMarkup(
    <LenderLayout>
      <p>Room</p>
    </LenderLayout>,
  );

  expect(markup).toContain('data-detects-time-zone');
  expect(markup).toContain('<p>Room</p>');
});
