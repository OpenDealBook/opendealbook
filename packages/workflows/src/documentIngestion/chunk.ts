export const EMBEDDING_MAX_TOKENS = 512;
export const EMBEDDING_OVERLAP_TOKENS = 64;

const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export interface ChunkOptions {
  maxTokens?: number;
  overlapTokens?: number;
}

export function chunkMarkdown(
  markdown: string,
  options: ChunkOptions = {},
): string[] {
  const maxTokens = options.maxTokens ?? EMBEDDING_MAX_TOKENS;
  const overlapChars = (options.overlapTokens ?? EMBEDDING_OVERLAP_TOKENS) * CHARS_PER_TOKEN;
  const maxChars = maxTokens * CHARS_PER_TOKEN;

  const chunks: string[] = [];
  let current = '';

  for (const segment of splitIntoSegments(markdown)) {
    for (const piece of fitToWindow(segment, maxChars)) {
      if (current === '') {
        current = piece;
        continue;
      }

      if (estimateTokens(`${current}\n\n${piece}`) <= maxTokens) {
        current = `${current}\n\n${piece}`;
        continue;
      }

      chunks.push(current);
      current = `${current.slice(-overlapChars)}\n\n${piece}`;
    }
  }

  if (current !== '') {
    chunks.push(current);
  }

  return chunks;
}

function splitIntoSegments(markdown: string): string[] {
  const isHeading = (line: string) => /^#{1,6}\s/.test(line);
  const segments: string[] = [];
  let buffer: string[] = [];

  for (const line of markdown.split('\n')) {
    if (isHeading(line) && buffer.length > 0) {
      segments.push(buffer.join('\n'));
      buffer = [line];
    } else {
      buffer.push(line);
    }
  }

  segments.push(buffer.join('\n'));

  return segments.map((segment) => segment.trim()).filter((segment) => segment.length > 0);
}

function fitToWindow(segment: string, maxChars: number): string[] {
  if (segment.length <= maxChars) {
    return [segment];
  }

  const pieces: string[] = [];
  for (let start = 0; start < segment.length; start += maxChars) {
    pieces.push(segment.slice(start, start + maxChars));
  }

  return pieces;
}
