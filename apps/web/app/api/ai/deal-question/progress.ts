type Input = Record<string, unknown>;

export type Progress =
  | { kind: 'search'; query: string }
  | { kind: 'search_past_answers'; query: string }
  | { kind: 'read_pages'; from: number; to: number }
  | { kind: 'read_sheet'; sheet: string; range: string }
  | { kind: 'list_documents' }
  | { kind: 'list_sheets' }
  | { kind: 'working' };

const WORKING: Progress = { kind: 'working' };

const PROGRESS: Record<string, (input: Input) => Progress> = {
  search_documents: ({ query }) =>
    typeof query === 'string' ? { kind: 'search', query } : WORKING,
  search_past_answers: ({ query }) =>
    typeof query === 'string'
      ? { kind: 'search_past_answers', query }
      : WORKING,
  read_document_pages: ({ from_page, to_page }) =>
    typeof from_page === 'number' && typeof to_page === 'number'
      ? { kind: 'read_pages', from: from_page, to: to_page }
      : WORKING,
  read_sheet_range: ({ sheet, a1_range }) =>
    typeof sheet === 'string' && typeof a1_range === 'string'
      ? { kind: 'read_sheet', sheet, range: a1_range }
      : WORKING,
  list_documents: () => ({ kind: 'list_documents' }),
  list_sheets: () => ({ kind: 'list_sheets' }),
};

export function progressOf({
  tool,
  input,
}: {
  tool: string;
  input: unknown;
}): Progress {
  if (
    !Object.hasOwn(PROGRESS, tool) ||
    typeof input !== 'object' ||
    input === null
  ) {
    return WORKING;
  }
  return PROGRESS[tool]!(input as Input);
}
