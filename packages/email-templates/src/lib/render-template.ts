import type { ReactElement } from 'react';

import { render } from 'react-email';

export interface RenderedEmail {
  html: string;
  text: string;
  subject: string;
}

export async function renderTemplate(
  element: ReactElement,
  subject: string,
): Promise<RenderedEmail> {
  const [html, text] = await Promise.all([
    render(element),
    render(element, { plainText: true }),
  ]);

  return { html, text, subject };
}
