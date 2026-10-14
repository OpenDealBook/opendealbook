const HEAD_CHARACTER_LIMIT = 256 * 1024;

const NAMED_REFERENCES = new Map([
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
  ['apos', "'"],
  ['nbsp', ' '],
]);

const MAX_CODE_POINT = 0x10ffff;

function decodeReferences(text: string): string {
  return text.replace(
    /&(?:#x([0-9a-f]{1,8})|#(\d{1,12})|([a-z]{1,8}));/gi,
    (reference, hex: string, decimal: string, named: string) => {
      if (named) {
        return NAMED_REFERENCES.get(named.toLowerCase()) ?? reference;
      }

      const codePoint = hex ? parseInt(hex, 16) : parseInt(decimal, 10);

      return codePoint <= MAX_CODE_POINT ? String.fromCodePoint(codePoint) : '';
    },
  );
}

function cleanName(text: string | undefined): string {
  return decodeReferences(text ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\p{Cc}/gu, '')
    .trim();
}

function isSpace(character: string | undefined): boolean {
  return (
    character === ' ' ||
    character === '\n' ||
    character === '\t' ||
    character === '\r' ||
    character === '\f'
  );
}

function endOfTagName(html: string, start: number): number {
  let at = start;

  while (
    at < html.length &&
    !isSpace(html[at]) &&
    html[at] !== '>' &&
    html[at] !== '<' &&
    (html[at] !== '/' || at === start)
  ) {
    at += 1;
  }

  return at;
}

function readAttributes(
  html: string,
  start: number,
): { attributes: Map<string, string>; end: number } {
  const attributes = new Map<string, string>();
  let at = start;

  for (;;) {
    while (isSpace(html[at]) || html[at] === '/') {
      at += 1;
    }

    if (at >= html.length || html[at] === '>') {
      return { attributes, end: at };
    }

    const nameStart = at;

    while (
      at < html.length &&
      !isSpace(html[at]) &&
      html[at] !== '=' &&
      html[at] !== '>' &&
      html[at] !== '/'
    ) {
      at += 1;
    }

    const name = html.slice(nameStart, at).toLowerCase();
    let value = '';

    while (isSpace(html[at])) {
      at += 1;
    }

    if (html[at] === '=') {
      at += 1;

      while (isSpace(html[at])) {
        at += 1;
      }

      const quote = html[at];

      if (quote === '"' || quote === "'") {
        const close = html.indexOf(quote, at + 1);
        const valueEnd = close === -1 ? html.length : close;

        value = html.slice(at + 1, valueEnd);
        at = valueEnd + 1;
      } else {
        const valueStart = at;

        while (at < html.length && !isSpace(html[at]) && html[at] !== '>') {
          at += 1;
        }

        value = html.slice(valueStart, at);
      }
    }

    if (!attributes.has(name)) {
      attributes.set(name, value);
    }
  }
}

export function parseSite(html: string): {
  name: string | null;
  iconHrefs: string[];
} {
  const head = html.slice(0, HEAD_CHARACTER_LIMIT);
  let siteName: string | undefined;
  let title: string | undefined;
  let appleTouchIcon: string | undefined;
  let icon: string | undefined;
  let at = head.indexOf('<');

  while (at !== -1) {
    const nameEnd = endOfTagName(head, at + 1);
    const tag = head.slice(at + 1, nameEnd).toLowerCase();
    let next = nameEnd;

    if (tag === '/head' || tag === 'body') {
      break;
    }

    if (tag === 'meta' || tag === 'link') {
      const { attributes, end } = readAttributes(head, nameEnd);
      const rel = attributes.get('rel')?.toLowerCase().split(/\s+/) ?? [];
      const href = attributes.get('href');

      if (attributes.get('property')?.toLowerCase() === 'og:site_name') {
        siteName ??= attributes.get('content');
      }

      if (tag === 'link' && href && rel.includes('apple-touch-icon')) {
        appleTouchIcon ??= href;
      }

      if (tag === 'link' && href && rel.includes('icon')) {
        icon ??= href;
      }

      next = end;
    }

    if (tag === 'title') {
      const open = head.indexOf('>', nameEnd);

      if (open === -1) {
        break;
      }

      const close = head.indexOf('<', open);

      title ??= head.slice(open + 1, close === -1 ? head.length : close);
      next = open;
    }

    at = head.indexOf('<', next);
  }

  return {
    name: cleanName(siteName) || cleanName(title) || null,
    iconHrefs: [
      ...(appleTouchIcon ? [decodeReferences(appleTouchIcon)] : []),
      ...(icon ? [decodeReferences(icon)] : []),
      '/favicon.ico',
    ],
  };
}
