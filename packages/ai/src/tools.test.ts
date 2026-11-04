import { describe, expect, it } from 'vitest';

import {
  documentTools,
  runDocumentTool,
  type DocumentToolContext,
} from './tools';

const unreachedContext = {} as DocumentToolContext;

function toolResultFor(name: string, input: unknown) {
  return runDocumentTool(unreachedContext, { id: 'call-0', name, input });
}

describe('document tool arguments', () => {
  it.each([
    [
      'read_document_pages',
      {
        type: 'object',
        properties: {
          document_id: {
            type: 'string',
            description:
              'The document id from search_documents or list_documents.',
          },
          from_page: { type: 'integer', description: 'First page to read.' },
          to_page: { type: 'integer', description: 'Last page to read.' },
        },
        required: ['document_id', 'from_page', 'to_page'],
        additionalProperties: false,
      },
    ],
    [
      'list_documents',
      {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false,
      },
    ],
    [
      'search_documents',
      {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Words or phrases to search for.',
          },
          include_earlier_versions: {
            type: 'boolean',
            description: 'Also search earlier versions of each document.',
          },
        },
        required: ['query'],
        additionalProperties: false,
      },
    ],
  ])('sends the %s schema to the provider', (name, inputSchema) => {
    expect(
      documentTools.find((tool) => tool.name === name)?.inputSchema,
    ).toEqual(inputSchema);
  });

  it.each([
    ['list_documents', [], 'Arguments must be a JSON object.'],
    ['list_documents', null, 'Arguments must be a JSON object.'],
    ['list_documents', { deal: 'x' }, 'Unknown argument "deal".'],
    ['list_documents', { constructor: 1 }, 'Unknown argument "constructor".'],
    [
      'search_past_answers',
      { query: 'q', toString: 'x' },
      'Unknown argument "toString".',
    ],
    ['search_documents', { extra: 1, query: 7 }, 'Unknown argument "extra".'],
    ['search_past_answers', {}, 'Missing argument "query".'],
    ['search_documents', { query: 7 }, 'Argument "query" must be a string.'],
    [
      'search_documents',
      { query: 'revenue', include_earlier_versions: 'yes' },
      'Argument "include_earlier_versions" must be true or false.',
    ],
    [
      'list_sheets',
      { document_id: 'nope' },
      'Argument "document_id" must be a document id.',
    ],
    [
      'read_document_pages',
      {
        document_id: '00000000-0000-0000-0000-000000000001',
        from_page: 1.5,
        to_page: 2,
      },
      'Argument "from_page" must be a page number.',
    ],
    [
      'read_document_pages',
      {
        document_id: '00000000-0000-0000-0000-000000000001',
        from_page: 1,
        to_page: 2 ** 60,
      },
      'Argument "to_page" must be a page number.',
    ],
    [
      'read_document_pages',
      {
        document_id: '00000000-0000-0000-0000-000000000001',
        from_page: 2 ** 60,
        to_page: 2,
      },
      'Argument "from_page" must be a page number.',
    ],
    [
      'read_sheet_range',
      { document_id: '00000000-0000-0000-0000-000000000001', sheet: 'P&L' },
      'Missing argument "a1_range".',
    ],
  ])('%s rejects %j', async (name, input, message) => {
    expect(await toolResultFor(name, input)).toEqual({
      content: message,
      isError: true,
      citations: [],
    });
  });
});
