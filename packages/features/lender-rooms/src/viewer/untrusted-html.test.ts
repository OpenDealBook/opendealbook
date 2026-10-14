import { describe, expect, it } from 'vitest';

import { inertDocument } from './untrusted-html';

// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const HOSTILE = [
  '<h1>Quarterly update</h1>',
  '<script>alert(document.domain)</script>',
  '<p onclick="alert(1)">Coverage held at <strong>1.25x</strong>.</p>',
  '<img src="x" onerror="alert(2)">',
  '<img src="https://tracker.example/open.gif">',
  '<img src="//tracker.example/relative.gif">',
  '<img alt="chart" src="data:image/png;base64,iVBORw0KGgo=">',
  '<a href="javascript:alert(3)">Statement</a>',
  '<a href="https://tracker.example/click">Portal</a>',
  '<iframe src="https://tracker.example/frame"></iframe>',
  '<style>p{background:url(https://tracker.example/bg.png)}</style>',
  '<p style="background:url(https://tracker.example/inline.png)">Regards</p>',
  '<meta http-equiv="refresh" content="0;url=https://tracker.example/refresh">',
  '<link rel="stylesheet" href="https://tracker.example/sheet.css">',
  '<form action="https://tracker.example/form"><input name="q"><button>Send</button></form>',
  '<svg><image href="https://tracker.example/vector.png"/></svg>',
  '<object data="https://tracker.example/object"></object>',
  '<table><tr><td colspan="2">EBITDA</td></tr></table>',
].join('');

describe('inertDocument', () => {
  const body = () =>
    new DOMParser().parseFromString(inertDocument(HOSTILE), 'text/html').body;

  it('removes script elements', () => {
    expect(body().querySelector('script')).toBeNull();
    expect(inertDocument(HOSTILE)).not.toContain('alert(');
  });

  it('removes event-handler attributes', () => {
    const handlers = [...body().querySelectorAll('*')].flatMap((element) =>
      element.getAttributeNames().filter((name) => name.startsWith('on')),
    );
    expect(handlers).toEqual([]);
  });

  it('leaves nothing that points at a remote host', () => {
    expect(inertDocument(HOSTILE)).not.toContain('tracker.example');
    expect(
      body().querySelector('iframe, object, form, input, link, svg'),
    ).toBeNull();
  });

  it('keeps only images embedded in the file itself', () => {
    const sources = [...body().querySelectorAll('img[src]')].map((image) =>
      image.getAttribute('src'),
    );
    expect(sources).toEqual(['data:image/png;base64,iVBORw0KGgo=']);
  });

  it('turns links into plain text', () => {
    expect(body().querySelector('a, [href]')).toBeNull();
    expect(body().textContent).toContain('Statement');
    expect(body().textContent).toContain('Portal');
  });

  it('keeps every element and attribute an ordinary document or email uses', () => {
    const ordinary = readFileSync(
      join(import.meta.dirname, 'fixtures', 'ordinary.html'),
      'utf8',
    );
    const shape = (root: Element) =>
      [...root.querySelectorAll('*')].map((element) =>
        [element.localName, ...element.getAttributeNames().sort()].join(' '),
      );

    const kept = new DOMParser().parseFromString(
      inertDocument(ordinary),
      'text/html',
    ).body;

    expect(shape(kept)).toEqual(
      shape(new DOMParser().parseFromString(ordinary, 'text/html').body),
    );
  });

  it.each(['code', 'hr', 'tfoot', 'a'])(
    'drops the %s element, which no fixture needs',
    (tag) => {
      const document = new DOMParser().parseFromString(
        inertDocument(`<table><${tag}>x</${tag}></table><${tag}>x</${tag}>`),
        'text/html',
      );

      expect(document.body.querySelector(tag)).toBeNull();
    },
  );

  it('forbids every network load through its content security policy', () => {
    const policy = new DOMParser()
      .parseFromString(inertDocument(HOSTILE), 'text/html')
      .querySelector('meta[http-equiv="Content-Security-Policy"]')
      ?.getAttribute('content');
    expect(policy).toBe(
      "default-src 'none'; img-src data:; style-src 'unsafe-inline'",
    );
  });
});
