import type { DocumentCitation } from './citations';

export const RECENT_MESSAGES = 10;

const QUOTE_LENGTH = 80;
const TAG_NAME_START = /[a-z/!]/i;

export function withoutTags(text: string): string {
  const kept: string[] = [];
  const tagStarts: number[] = [];
  for (const char of text) {
    if (char === '>' && tagStarts.length > 0) {
      kept.length = tagStarts.pop()!;
      continue;
    }
    if (kept.at(-1) === '<' && TAG_NAME_START.test(char)) {
      tagStarts.push(kept.length - 1);
    }
    kept.push(char);
  }
  return kept.join('');
}

export function quoted(text: string): string {
  return `"${
    text.length > QUOTE_LENGTH ? `${text.slice(0, QUOTE_LENGTH - 1)}…` : text
  }"`;
}

export function promptScaffold(locale: string) {
  const tag = `msg-${crypto.randomUUID().replaceAll('-', '')}`;
  return {
    tag,
    language: new Intl.DisplayNames(['en'], { type: 'language' }).of(locale),
    block: (role: string, text: string) =>
      `<${tag} role="${role}">\n${text}\n</${tag}>`,
  };
}

export function attachmentLines(
  attachments: { documentId: string; name: string; version: number }[],
  skipped: number,
): string[] {
  return [
    ...attachments.map(
      ({ documentId, name, version }) =>
        `${withoutTags(name)} v${version}, document ${documentId}`,
    ),
    ...(skipped > 0
      ? [
          skipped === 1
            ? '1 attached document could not be read.'
            : `${skipped} attached documents could not be read.`,
        ]
      : []),
  ];
}

export function citedPassages(
  labels: string[],
  cite: (label: string) => DocumentCitation | undefined,
): { citations: DocumentCitation[] } | { error: string } {
  const citations = new Map<string, DocumentCitation>();
  for (const label of labels) {
    const citation = cite(label);
    if (!citation) {
      return {
        error: `The label ${quoted(label)} names no passage you read. Use only labels the tools showed you.`,
      };
    }
    citations.set(label, citation);
  }
  return { citations: [...citations.values()] };
}
