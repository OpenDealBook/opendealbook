import { describe, expect, it } from 'vitest';

import { progressOf } from './progress';

describe('progressOf', () => {
  it.each([
    [
      'search_documents',
      { query: 'EBITDA' },
      { kind: 'search', query: 'EBITDA' },
    ],
    [
      'read_document_pages',
      { document_id: 'd', from_page: 4, to_page: 5 },
      { kind: 'read_pages', from: 4, to: 5 },
    ],
    [
      'read_sheet_range',
      { document_id: 'd', sheet: 'P&L', a1_range: 'A1:C9' },
      { kind: 'read_sheet', sheet: 'P&L', range: 'A1:C9' },
    ],
    [
      'search_past_answers',
      { query: 'EBITDA' },
      { kind: 'search_past_answers', query: 'EBITDA' },
    ],
    ['list_documents', {}, { kind: 'list_documents' }],
    ['list_sheets', { document_id: 'd' }, { kind: 'list_sheets' }],
  ])('describes %s %j', (tool, input, progress) => {
    expect(progressOf({ tool, input })).toEqual(progress);
  });

  it.each([
    ['search_documents', null],
    ['search_documents', 'EBITDA'],
    ['search_documents', { query: 7 }],
    ['search_documents', {}],
    ['search_past_answers', null],
    ['search_past_answers', 'EBITDA'],
    ['search_past_answers', { query: 7 }],
    ['search_past_answers', {}],
    ['read_document_pages', { from_page: '4', to_page: 5 }],
    ['read_document_pages', { from_page: 4 }],
    ['read_sheet_range', { sheet: 'P&L' }],
    ['read_sheet_range', [1, 2]],
    ['delete_everything', { query: 'EBITDA' }],
    ['constructor', {}],
    ['toString', {}],
  ])('says working for %s %j', (tool, input) => {
    expect(progressOf({ tool, input })).toEqual({ kind: 'working' });
  });
});
