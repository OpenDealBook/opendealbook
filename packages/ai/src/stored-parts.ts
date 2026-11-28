import { z } from 'zod';

import { getLogger } from '@odb/shared/logger';

import { answerPart, type AnswerPart } from './parts';

const FIGURE = /\[\[figure (\d+)\]\]/g;

export function parseStoredParts(
  stored: unknown,
  questionId: string,
): AnswerPart[] {
  return z
    .array(z.unknown())
    .parse(stored)
    .flatMap((entry) => {
      const parsed = answerPart.safeParse(entry);
      if (!parsed.success) {
        getLogger().warn(
          { questionId, err: parsed.error },
          'Dropped a stored AI answer part that does not parse',
        );
        return [];
      }
      return [parsed.data];
    });
}

function partText(
  { documentName, page, sheet, note }: AnswerPart,
  withNote = true,
): string {
  const opensAt =
    page !== undefined
      ? ` (page ${page})`
      : sheet !== undefined
        ? ` (sheet ${sheet})`
        : '';
  return `Document: ${documentName}${opensAt}${note && withNote ? `. ${note}` : ''}`;
}

export function partsText(parts: AnswerPart[]): string {
  return parts.map((part) => partText(part)).join('\n');
}

export function withPartsText(
  answer: string,
  parts: AnswerPart[],
  readable: ReadonlySet<string>,
): string {
  const placed = new Set<AnswerPart>();
  const text = (part: AnswerPart) =>
    partText(part, readable.has(part.documentId));
  const replaced = answer.replace(FIGURE, (_, id: string) => {
    const part = parts.find((candidate) => candidate.id === Number(id));
    if (!part || placed.has(part)) {
      return '';
    }
    placed.add(part);
    return text(part);
  });
  return [
    replaced,
    ...parts.filter((part) => !placed.has(part)).map(text),
  ].join('\n');
}
