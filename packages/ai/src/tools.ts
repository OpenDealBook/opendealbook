import type { SupabaseClient } from '@supabase/supabase-js';

import { z } from 'zod';

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

class ToolError extends Error {}

const A1_RANGE = /^\$?[A-Z]+\$?[0-9]+(?::\$?[A-Z]+\$?[0-9]+)?$/i;

const stringArg = (description: string) =>
  z.string({ error: 'a string' }).describe(description);
const integerArg = (noun: string, description: string) =>
  z.int({ error: noun }).describe(description);

function argumentErrorMessage({ issues }: z.ZodError): string {
  const issue =
    issues.find(({ code }) => code === 'unrecognized_keys') ?? issues[0]!;
  if (issue.code === 'unrecognized_keys') {
    return `Unknown argument "${issue.keys[0]}".`;
  }
  const [name] = issue.path;
  if (name === undefined) {
    return 'Arguments must be a JSON object.';
  }
  return issue.input === undefined
    ? `Missing argument "${String(name)}".`
    : `Argument "${String(name)}" must be ${issue.message}.`;
}

interface DocumentTool extends ToolDefinition {
  execute: (
    context: DocumentToolContext,
    input: unknown,
  ) => Promise<DocumentToolResult>;
}

function documentTool<A extends z.ZodObject>(tool: {
  name: string;
  description: string;
  args: A;
  run: (
    context: DocumentToolContext,
    args: z.infer<A>,
  ) => Promise<DocumentToolResult>;
}): DocumentTool {
  const inputSchema = z.toJSONSchema(tool.args, {
    override: ({ jsonSchema }) => {
      delete jsonSchema.format;
      delete jsonSchema.pattern;
      delete jsonSchema.minimum;
      delete jsonSchema.maximum;
    },
  });
  delete inputSchema.$schema;
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: { ...inputSchema, required: inputSchema.required ?? [] },
    execute: (context, input) => {
      const parsed = tool.args.safeParse(input, { reportInput: true });
      if (!parsed.success) {
        throw new ToolError(argumentErrorMessage(parsed.error));
      }
      return tool.run(context, parsed.data);
    },
  };
}

const OCR_MARK = '(OCR text, lower confidence)';
const PAST_ANSWERS_ARE_NOT_SOURCES =
  'Past answers are not sources. To cite anything in them, read the documents again.';
const CUT_OFF = 'This read was cut off at the 32000 character limit.';
const EXCERPT_LENGTH = 300;
const ELLIPSIS = '\u2026';
const HEADLINE_MARK = /<\/?b>/g;

function excerptOf(text: string): string {
  const flat = text.replaceAll(/\s+/g, ' ').trim();
  if (flat.length <= EXCERPT_LENGTH) {
    return flat;
  }
  const room = EXCERPT_LENGTH - ELLIPSIS.length;
  const wordEnd = flat.lastIndexOf(' ', room);
  return `${flat.slice(0, wordEnd > 0 ? wordEnd : room)}${ELLIPSIS}`;
}

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

const documentIdArg = z
  .guid({ error: 'a document id' })
  .describe('The document id from search_documents or list_documents.');

const TOOLS: DocumentTool[] = [
  documentTool({
    name: 'search_documents',
    description:
      "Full-text search over the deal's documents. Returns ranked snippets with the document id and the pages or cells they come from.",
    args: z.strictObject({
      query: stringArg('Words or phrases to search for.'),
      include_earlier_versions: z
        .boolean({ error: 'true or false' })
        .describe('Also search earlier versions of each document.')
        .optional(),
    }),
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
            excerpt: excerptOf(hit.snippet.replaceAll(HEADLINE_MARK, '')),
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
    args: z.strictObject({
      query: stringArg('Words or phrases to search for.'),
    }),
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
    args: z.strictObject({
      document_id: documentIdArg,
      from_page: integerArg('a page number', 'First page to read.'),
      to_page: integerArg('a page number', 'Last page to read.'),
    }),
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
        citation: {
          ...document,
          pageFrom: row.page_from,
          pageTo: row.page_to,
          excerpt: excerptOf(row.text),
        },
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
    args: z.strictObject({
      document_id: documentIdArg,
      sheet: stringArg('Sheet name from list_sheets.'),
      a1_range: stringArg('A1 range such as A1:F40.'),
    }),
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
        citation: {
          ...document,
          sheet: args.sheet,
          cellRange: row.cell_range,
          excerpt: excerptOf(row.text),
        },
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
    args: z.strictObject({}),
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
    args: z.strictObject({ document_id: documentIdArg }),
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
