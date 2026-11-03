import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@odb/supabase';
import type {
  ConversationMessage,
  ToolCall,
  ToolDefinition,
} from '@odb/workflows/team-ai';

import {
  citationLabel,
  type CitedDocument,
  type DocumentCitation,
} from './citations';

type Client = SupabaseClient<Database>;

export interface DocumentToolContext {
  client: Client;
  dealId: string;
}

type ToolMessage = Extract<ConversationMessage, { role: 'tool' }>;

export type DocumentToolResult = Pick<ToolMessage, 'content' | 'isError'> & {
  citations: DocumentCitation[];
};

type FieldType = 'string' | 'uuid' | 'integer' | 'boolean';

interface Field {
  type: FieldType;
  description: string;
  optional?: true;
}

type Fields = Record<string, Field>;

type ValueOf<T extends FieldType> = {
  string: string;
  uuid: string;
  integer: number;
  boolean: boolean;
}[T];

type Args<F extends Fields> = {
  [K in keyof F as F[K]['optional'] extends true ? never : K]: ValueOf<
    F[K]['type']
  >;
} & {
  [K in keyof F as F[K]['optional'] extends true ? K : never]?: ValueOf<
    F[K]['type']
  >;
};

class ToolError extends Error {}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const A1_RANGE = /^\$?[A-Z]+\$?[0-9]+(?::\$?[A-Z]+\$?[0-9]+)?$/i;

const FIELD_TYPES: Record<
  FieldType,
  { jsonType: string; noun: string; accepts: (value: unknown) => boolean }
> = {
  string: {
    jsonType: 'string',
    noun: 'a string',
    accepts: (value) => typeof value === 'string',
  },
  uuid: {
    jsonType: 'string',
    noun: 'a document id',
    accepts: (value) => typeof value === 'string' && UUID.test(value),
  },
  integer: {
    jsonType: 'integer',
    noun: 'an integer',
    accepts: (value) => Number.isInteger(value),
  },
  boolean: {
    jsonType: 'boolean',
    noun: 'true or false',
    accepts: (value) => typeof value === 'boolean',
  },
};

function parseArgs<F extends Fields>(fields: F, input: unknown): Args<F> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new ToolError('Arguments must be a JSON object.');
  }
  const given = new Map(Object.entries(input));
  for (const name of given.keys()) {
    if (!(name in fields)) {
      throw new ToolError(`Unknown argument "${name}".`);
    }
  }
  for (const [name, field] of Object.entries(fields)) {
    const value = given.get(name);
    if (value === undefined) {
      if (!field.optional) {
        throw new ToolError(`Missing argument "${name}".`);
      }
    } else if (!FIELD_TYPES[field.type].accepts(value)) {
      throw new ToolError(
        `Argument "${name}" must be ${FIELD_TYPES[field.type].noun}.`,
      );
    }
  }
  return input as Args<F>;
}

function inputSchema(fields: Fields) {
  return {
    type: 'object',
    properties: Object.fromEntries(
      Object.entries(fields).map(([name, { type, description }]) => [
        name,
        { type: FIELD_TYPES[type].jsonType, description },
      ]),
    ),
    required: Object.entries(fields)
      .filter(([, field]) => !field.optional)
      .map(([name]) => name),
    additionalProperties: false,
  };
}

interface DocumentTool {
  name: string;
  description: string;
  inputSchema: ReturnType<typeof inputSchema>;
  execute: (
    context: DocumentToolContext,
    input: unknown,
  ) => Promise<DocumentToolResult>;
}

function documentTool<F extends Fields>(tool: {
  name: string;
  description: string;
  fields: F;
  run: (
    context: DocumentToolContext,
    args: Args<F>,
  ) => Promise<DocumentToolResult>;
}): DocumentTool {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: inputSchema(tool.fields),
    execute: (context, input) =>
      tool.run(context, parseArgs(tool.fields, input)),
  };
}

const OCR_MARK = '(OCR text, lower confidence)';
const PAST_ANSWERS_ARE_NOT_SOURCES =
  'Past answers are not sources. To cite anything in them, read the documents again.';
const CUT_OFF = 'This read was cut off at the 32000 character limit.';

interface Passage {
  citation: DocumentCitation;
  text: string;
  fromOcr: boolean;
}

function combine(
  passages: Passage[],
  cutOff: string | null,
): DocumentToolResult {
  const texts = passages.map(({ citation, text, fromOcr }) => {
    const mark = fromOcr ? ` ${OCR_MARK}` : '';
    return `[${citationLabel(citation)}]${mark}\n${text}`;
  });
  return {
    content: [...texts, ...(cutOff ? [cutOff] : [])].join('\n\n'),
    citations: passages.map(({ citation }) => citation),
  };
}

async function citedDocument(
  { client, dealId }: DocumentToolContext,
  documentId: string,
): Promise<CitedDocument> {
  const { data } = await client
    .from('dr_document')
    .select('id, name, version')
    .eq('id', documentId)
    .eq('deal_id', dealId)
    .maybeSingle()
    .throwOnError();
  if (!data) {
    throw new ToolError(`No document ${documentId} in this deal.`);
  }
  return {
    documentId: data.id,
    documentName: data.name,
    version: data.version,
  };
}

const DOCUMENT_ID = {
  type: 'uuid',
  description: 'The document id from search_documents or list_documents.',
} as const satisfies Field;

const TOOLS: DocumentTool[] = [
  documentTool({
    name: 'search_documents',
    description:
      "Full-text search over the deal's documents. Returns ranked snippets with the document id and the pages or cells they come from.",
    fields: {
      query: { type: 'string', description: 'Words or phrases to search for.' },
      include_earlier_versions: {
        type: 'boolean',
        description: 'Also search earlier versions of each document.',
        optional: true,
      },
    },
    run: async ({ client, dealId }, args) => {
      const { data } = await client
        .rpc('search_document_segments', {
          deal_id: dealId,
          query: args.query,
          include_earlier_versions: args.include_earlier_versions ?? false,
        })
        .throwOnError();
      if (data.length === 0) {
        return { content: 'No matches.', citations: [] };
      }
      return combine(
        data.map((hit) => {
          const document = {
            documentId: hit.dr_document_id,
            documentName: hit.document_name,
            version: hit.document_version,
          };
          return {
            citation:
              hit.sheet === null
                ? { ...document, pageFrom: hit.page_from, pageTo: hit.page_to }
                : { ...document, sheet: hit.sheet, cellRange: hit.cell_range },
            text: `document ${hit.dr_document_id}\n${hit.snippet}`,
            fromOcr: hit.from_ocr,
          };
        }),
        null,
      );
    },
  }),
  documentTool({
    name: 'search_past_answers',
    description:
      'Search questions already answered on this deal, by anyone on the team. Past answers are not sources and cannot be cited.',
    fields: {
      query: { type: 'string', description: 'Words or phrases to search for.' },
    },
    run: async ({ client, dealId }, args) => {
      const { data } = await client
        .rpc('search_deal_ai_answers', {
          p_deal_id: dealId,
          p_query: args.query,
        })
        .throwOnError();
      if (data.length === 0) {
        return { content: 'No earlier answers.', citations: [] };
      }
      const answers = data.map(
        (hit) =>
          `Question (asked ${hit.asked_at.slice(0, 10)}): ${hit.question}\nAnswer: ${hit.answer}`,
      );
      return {
        content: [...answers, PAST_ANSWERS_ARE_NOT_SOURCES].join('\n\n'),
        citations: [],
      };
    },
  }),
  documentTool({
    name: 'read_document_pages',
    description:
      'Read the text of a page range of one document, up to 32000 characters.',
    fields: {
      document_id: DOCUMENT_ID,
      from_page: { type: 'integer', description: 'First page to read.' },
      to_page: { type: 'integer', description: 'Last page to read.' },
    },
    run: async (context, args) => {
      const document = await citedDocument(context, args.document_id);
      const { data } = await context.client
        .rpc('read_document_pages', {
          document_id: args.document_id,
          from_page: args.from_page,
          to_page: args.to_page,
        })
        .throwOnError();
      const [first] = data;
      if (!first) {
        throw new ToolError(
          `${document.documentName} has no text on pages ${args.from_page}-${args.to_page}.`,
        );
      }
      const passages = data.map((row) => ({
        citation: { ...document, pageFrom: row.page_from, pageTo: row.page_to },
        text: row.text,
        fromOcr: row.from_ocr,
      }));
      const cutOff = first.truncated
        ? `${CUT_OFF} Read from page ${first.next_page} to continue.`
        : null;
      return combine(passages, cutOff);
    },
  }),
  documentTool({
    name: 'read_sheet_range',
    description:
      'Read the cells of an A1 range on one sheet of a workbook, up to 32000 characters.',
    fields: {
      document_id: DOCUMENT_ID,
      sheet: { type: 'string', description: 'Sheet name from list_sheets.' },
      a1_range: {
        type: 'string',
        description: 'A1 range such as A1:F40.',
      },
    },
    run: async (context, args) => {
      const document = await citedDocument(context, args.document_id);
      const { data: sheets } = await context.client
        .rpc('list_sheets', { document_id: args.document_id })
        .throwOnError();
      if (!sheets.some(({ sheet }) => sheet === args.sheet)) {
        throw new ToolError(
          `${document.documentName} has no sheet "${args.sheet}".`,
        );
      }
      if (!A1_RANGE.test(args.a1_range)) {
        throw new ToolError(`"${args.a1_range}" is not an A1 range.`);
      }
      const { data } = await context.client
        .rpc('read_sheet_range', {
          document_id: args.document_id,
          sheet: args.sheet,
          a1_range: args.a1_range,
        })
        .throwOnError();
      const [first] = data;
      if (!first) {
        throw new ToolError(`${args.sheet}!${args.a1_range} holds no cells.`);
      }
      const passages = data.map((row) => ({
        citation: { ...document, sheet: args.sheet, cellRange: row.cell_range },
        text: row.text,
        fromOcr: row.from_ocr,
      }));
      const cutOff = first.truncated
        ? `${CUT_OFF} Read a smaller range to continue.`
        : null;
      return combine(passages, cutOff);
    },
  }),
  documentTool({
    name: 'list_documents',
    description:
      'List the latest version of each document in the deal that has text, with its id, page count or sheets.',
    fields: {},
    run: async ({ client, dealId }) => {
      const { data } = await client
        .rpc('list_documents', { deal_id: dealId })
        .throwOnError();
      const lines = data.map((row) => {
        const extent =
          row.sheets === null
            ? `${row.page_count} pages`
            : `sheets: ${row.sheets.join(', ')}`;
        return `${row.name} v${row.version}, document ${row.document_id}, ${extent}`;
      });
      return {
        content: lines.length === 0 ? 'No documents.' : lines.join('\n'),
        citations: [],
      };
    },
  }),
  documentTool({
    name: 'list_sheets',
    description:
      'List the sheets of a workbook in order, with the A1 range each one uses.',
    fields: { document_id: DOCUMENT_ID },
    run: async (context, args) => {
      const document = await citedDocument(context, args.document_id);
      const { data } = await context.client
        .rpc('list_sheets', { document_id: args.document_id })
        .throwOnError();
      return {
        content:
          data.length === 0
            ? `${document.documentName} has no sheets.`
            : data.map((row) => `${row.sheet}: ${row.used_range}`).join('\n'),
        citations: [],
      };
    },
  }),
];

const TOOLS_BY_NAME = new Map(TOOLS.map((tool) => [tool.name, tool]));

export const documentTools: ToolDefinition[] = TOOLS.map(
  ({ name, description, inputSchema }) => ({ name, description, inputSchema }),
);

export async function runDocumentTool(
  context: DocumentToolContext,
  call: ToolCall,
): Promise<DocumentToolResult> {
  const tool = TOOLS_BY_NAME.get(call.name);
  if (!tool) {
    return {
      content: `Unknown tool "${call.name}".`,
      isError: true,
      citations: [],
    };
  }
  try {
    return await tool.execute(context, call.input);
  } catch (error) {
    if (error instanceof ToolError) {
      return { content: error.message, isError: true, citations: [] };
    }
    throw error;
  }
}
