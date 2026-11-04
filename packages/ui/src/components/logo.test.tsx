import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';

import { Logo } from './logo';

it('draws its gradient from the forest primary to the brass token', () => {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(<Logo />);

  const stops = [...host.querySelectorAll('stop')].map((stop) =>
    stop.style.getPropertyValue('stop-color'),
  );

  expect(stops).toEqual(['var(--primary)', 'var(--brass)']);
});
