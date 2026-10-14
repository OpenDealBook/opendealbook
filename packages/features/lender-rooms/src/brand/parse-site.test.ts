import { describe, expect, it } from 'vitest';

import { parseSite } from './parse-site';

describe('parseSite name', () => {
  it('prefers og:site_name over the title', () => {
    const html = `<html><head><title>Home | First Bank</title>
      <meta property="og:site_name" content="First Bank"></head></html>`;

    expect(parseSite(html).name).toBe('First Bank');
  });

  it('reads og:site_name whatever the attribute order and quoting', () => {
    const html = `<META content='First Bank' PROPERTY=og:site_name />`;

    expect(parseSite(html).name).toBe('First Bank');
  });

  it('falls back to the trimmed title', () => {
    const html = `<head><meta property="og:title" content="Welcome">
      <title lang="en">
        First Bank
      </title></head>`;

    expect(parseSite(html).name).toBe('First Bank');
  });

  it('falls back to the title when og:site_name is empty', () => {
    const html = `<meta property="og:site_name" content=""><title>First Bank</title>`;

    expect(parseSite(html).name).toBe('First Bank');
  });

  it('decodes character references', () => {
    const html = `<title>First Bank &amp; Trust &#8211; S&#x26;L</title>`;

    expect(parseSite(html).name).toBe('First Bank & Trust – S&L');
  });

  it.each([
    ['beyond the Unicode range', '&#x110000;'],
    ['far beyond the Unicode range', '&#99999999999;'],
    ['to a NUL', '&#0;'],
    ['to a control character', '&#x1b;'],
    ['to a C1 control character', '&#x9b;'],
  ])('drops a numeric reference %s', (_label, reference) => {
    expect(parseSite(`<title>First${reference} Bank</title>`).name).toBe(
      'First Bank',
    );
  });

  it('leaves no raw control characters in a name', () => {
    expect(parseSite('<title>First\u0000\u001b Bank\u0085</title>').name).toBe(
      'First Bank',
    );
  });

  it('joins a title written across lines with single spaces', () => {
    expect(parseSite('<title>First\n\t  Bank</title>').name).toBe('First Bank');
  });

  it('leaves an unknown named reference as written', () => {
    expect(parseSite('<title>First &constructor; Bank</title>').name).toBe(
      'First &constructor; Bank',
    );
  });

  it('has no name when the page has neither', () => {
    expect(parseSite('<html><body>hello</body></html>').name).toBeNull();
  });
});

describe('parseSite icon candidates', () => {
  it('lists apple-touch-icon, then rel icon, then /favicon.ico', () => {
    const html = `<link rel="icon" href="/favicon-32.png">
      <link rel="apple-touch-icon" sizes="180x180" href="/apple.png">`;

    expect(parseSite(html).iconHrefs).toEqual([
      '/apple.png',
      '/favicon-32.png',
      '/favicon.ico',
    ]);
  });

  it('takes the first link of each kind', () => {
    const html = `<link rel="icon" href="/first.png"><link rel="icon" href="/second.png">`;

    expect(parseSite(html).iconHrefs).toEqual(['/first.png', '/favicon.ico']);
  });

  it('reads the shortcut icon spelling', () => {
    const html = `<link href="/fav.png" rel="SHORTCUT ICON">`;

    expect(parseSite(html).iconHrefs).toEqual(['/fav.png', '/favicon.ico']);
  });

  it('decodes character references in an href', () => {
    const html = `<link rel="icon" href="/fav.png?v=1&amp;s=2">`;

    expect(parseSite(html).iconHrefs[0]).toBe('/fav.png?v=1&s=2');
  });

  it('has only /favicon.ico when the page links no icon', () => {
    const html = `<link rel="stylesheet" href="/site.css">
      <link rel="mask-icon" href="/mask.svg">`;

    expect(parseSite(html).iconHrefs).toEqual(['/favicon.ico']);
  });
});

describe('parseSite document head', () => {
  const BODY_TAGS = `<title>From the body</title>
    <meta property="og:site_name" content="From the body">
    <link rel="icon" href="/from-the-body.png">`;

  it.each([
    ['after the head closes', `<head></head>${BODY_TAGS}`],
    ['after the body opens', `<BODY class="home">${BODY_TAGS}`],
    ['past the first 256 KiB', `${' '.repeat(256 * 1024)}${BODY_TAGS}`],
  ])('ignores tags %s', (_label, html) => {
    expect(parseSite(html)).toEqual({
      name: null,
      iconHrefs: ['/favicon.ico'],
    });
  });

  it('reads self-closed tags and tags with no space before the slash', () => {
    const html = `<meta property="og:site_name" content="First Bank"/><link rel="icon" href="/fav.png" />`;

    expect(parseSite(html)).toEqual({
      name: 'First Bank',
      iconHrefs: ['/fav.png', '/favicon.ico'],
    });
  });

  it('reads a value-less attribute without losing the ones after it', () => {
    const html = `<link crossorigin rel=icon href=/fav.png>`;

    expect(parseSite(html).iconHrefs[0]).toBe('/fav.png');
  });
});

describe('parseSite on hostile input', () => {
  const SIZE = 1024 * 1024;

  it.each([
    ['one endless attribute', `<meta ${'a'.repeat(SIZE)}>`],
    ['tags that never close', '<link '.repeat(SIZE / 6)],
    ['titles that never close', '<title'.repeat(SIZE / 6)],
    ['unterminated references', `<title>${'&#1'.repeat(SIZE / 3)}</title>`],
    ['an unclosed quote', `<meta content="${'<meta '.repeat(SIZE / 6)}`],
  ])('parses a mebibyte of %s in well under a second', (_label, html) => {
    const started = performance.now();

    parseSite(html);

    expect(performance.now() - started).toBeLessThan(250);
  });
});
