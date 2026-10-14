import DOMPurify from 'dompurify';

const CONTENT_SECURITY_POLICY =
  "default-src 'none'; img-src data:; style-src 'unsafe-inline'";

const PAGE_STYLE = `
html { background: transparent; }
body {
  box-sizing: border-box;
  max-width: 8.5in;
  margin: 24px auto;
  padding: 0.9in 1in;
  background: #fff;
  color: #1c1d1f;
  font: 11pt/1.55 Calibri, Carlito, 'Helvetica Neue', Arial, sans-serif;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.18), 0 6px 24px rgb(0 0 0 / 0.08);
  overflow-wrap: anywhere;
}
h1, h2, h3, h4, h5, h6 { line-height: 1.25; margin: 1.2em 0 0.4em; }
p { margin: 0 0 0.75em; }
img { max-width: 100%; height: auto; }
table { border-collapse: collapse; margin: 0 0 1em; }
td, th { border: 1px solid #c9ccd1; padding: 4px 8px; vertical-align: top; text-align: left; }
td > p:last-child, th > p:last-child { margin-bottom: 0; }
@media (max-width: 720px) { body { margin: 0; padding: 24px 20px; box-shadow: none; } }
`;

const ALLOWED_TAGS = [
  'b',
  'blockquote',
  'br',
  'div',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'i',
  'img',
  'li',
  'ol',
  'p',
  'pre',
  's',
  'span',
  'strong',
  'sub',
  'sup',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'u',
  'ul',
];

export function inertDocument(html: string): string {
  const body = DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ['alt', 'colspan', 'rowspan', 'src'],
    ALLOWED_URI_REGEXP: /^data:image\//i,
    // Without this DOMPurify tests every attribute value against ALLOWED_URI_REGEXP and drops the spans.
    ADD_URI_SAFE_ATTR: ['colspan', 'rowspan'],
  });
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}"><style>${PAGE_STYLE}</style></head><body>${body}</body></html>`;
}
