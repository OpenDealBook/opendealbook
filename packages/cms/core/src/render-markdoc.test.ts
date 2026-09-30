import Markdoc from '@markdoc/markdoc';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { renderMarkdoc } from './render-markdoc';

const sample = [
  '# Title',
  '',
  'A paragraph with a [link](https://example.com) and `inline` code.',
  '',
  '- one',
  '- two',
  '',
  '> a quote',
  '',
  '```',
  'code block',
  '```',
  '',
  '![alt text](/cover.png)',
].join('\n');

describe('renderMarkdoc', () => {
  it('renders a markdoc string into the expected html structure', () => {
    const html = renderToStaticMarkup(renderMarkdoc(sample));

    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<a href="https://example.com">link</a>');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>one</li>');
    expect(html).toContain('<blockquote>');
    expect(html).toContain('<pre>');
    expect(html).toContain('<code>');
    expect(html).toContain('<img');
    expect(html).toContain('src="/cover.png"');
  });

  it('renders a parsed markdoc node body from the reader', () => {
    const html = renderToStaticMarkup(
      renderMarkdoc({ node: Markdoc.parse(sample) }),
    );

    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<img');
  });
});
