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
import type { AnswerPart } from './parts';
import { parseStoredCitations } from './stored-citations';
import { parseStoredParts, withPartsText } from './stored-parts';

type Client = SupabaseClient<Database>;

export interface DocumentToolContext {
  client: Client;
  dealId: string;
}

type Rows<F extends keyof Database['public']['Functions']> =
  Database['public']['Functions'][F]['Returns'];

export interface DocumentReads<C> {
  scope: string;
  citedDocument: (context: C, documentId: string) => Promise<CitedDocument>;
  searchSegments: (
    context: C,
    args: { query: string; include_earlier_versions: boolean },
  ) => Promise<Rows<'search_document_segments'>>;
  readPages: (
    context: C,
    args: { document_id: string; from_page: number; to_page: number },
  ) => Promise<Rows<'read_document_pages'>>;
  listSheets: (context: C, documentId: string) => Promise<Rows<'list_sheets'>>;
  readSheetRange: (
    context: C,
    args: { document_id: string; sheet: string; a1_range: string },
  ) => Promise<Rows<'read_sheet_range'>>;
  listDocuments: (context: C) => Promise<Rows<'list_documents'>>;
}

type ToolMessage = Extract<ConversationMessage, { role: 'tool' }>;

export type DocumentToolResult = Pick<ToolMessage, 'content' | 'isError'> & {
  citations: DocumentCitation[];
  part?: Omit<AnswerPart, 'id'>;
};

export class ToolError extends Error {}

const A1_RANGE = /^\$?[A-Z]+\$?[0-9]+(?::\$?[A-Z]+\$?[0-9]+)?$/i;

export const stringArg = (description: string) =>
  z.string({ error: 'a string' }).describe(description);
const integerArg = (noun: string, description: string) =>
  z.int({ error: noun }).describe(description);

export function argumentErrorMessage({ issues }: z.ZodError): string {
  const issue =
    issues.find(({ code }) => code === 'unrecognized_keys') ?? issues[0]!;
  if (issue.code === 'unrecognized_keys') {
    return `Unknown argument "${issue.keys[0]}".`;
  }
  if (issue.path.length === 0) {
    return 'Arguments must be a JSON object.';
  }
  const name = issue.path.map(String).join('.');
  return issue.input === undefined
    ? `Missing argument "${name}".`
    : `Argument "${name}" must be ${issue.message}.`;
}

interface DocumentTool<C> extends ToolDefinition {
  execute: (context: C, input: unknown) => Promise<DocumentToolResult>;
}

export function providerSchema(
  args: z.ZodObject,
): ToolDefinition['inputSchema'] {
  const inputSchema = z.toJSONSchema(args, {
    override: ({ jsonSchema }) => {
      delete jsonSchema.format;
      delete jsonSchema.pattern;
      delete jsonSchema.minimum;
      delete jsonSchema.maximum;
      delete jsonSchema.minItems;
      delete jsonSchema.maxItems;
      delete jsonSchema.minLength;
      delete jsonSchema.maxLength;
    },
  });
  delete inputSchema.$schema;
  return { ...inputSchema, required: inputSchema.required ?? [] };
}

export function documentTool<C, A extends z.ZodObject>(tool: {
  name: string;
  description: string;
  args: A;
  run: (context: C, args: z.infer<A>) => Promise<DocumentToolResult>;
}): DocumentTool<C> {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: providerSchema(tool.args),
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
}

function combine(
  passages: Passage[],
  cutOff: string | null,
): DocumentToolResult {
  const texts = passages.map(({ citation, text }) => {
    const mark = citation.fromOcr ? ` ${OCR_MARK}` : '';
    return `[${citationLabel(citation)}]${mark}\n${text}`;
  });
  return {
    content: [...texts, ...(cutOff ? [cutOff] : [])].join('\n\n'),
    citations: passages.map(({ citation }) => citation),
  };
}

const documentIdArg = z
  .guid({ error: 'a document id' })
  .describe('The document id from search_documents or list_documents.');

function readTools<C>(reads: DocumentReads<C>) {
  const searchDocuments = documentTool({
    name: 'search_documents',
    description: `Full-text search over the ${reads.scope}'s documents. Returns ranked snippets with the document id and the pages or cells they come from.`,
    args: z.strictObject({
      query: stringArg('Words or phrases to search for.'),
      include_earlier_versions: z
        .boolean({ error: 'true or false' })
        .describe('Also search earlier versions of each document.')
        .optional(),
    }),
    run: async (context: C, args) => {
      const data = await reads.searchSegments(context, {
        query: args.query,
        include_earlier_versions: args.include_earlier_versions ?? false,
      });
      if (data.length === 0) {
        return { content: 'No matches.', citations: [] };
      }
      return combine(
        data.map((hit) => {
          const citedPassage = {
            documentId: hit.dr_document_id,
            documentName: hit.document_name,
            version: hit.document_version,
            excerpt: excerptOf(hit.snippet.replaceAll(HEADLINE_MARK, '')),
            fromOcr: hit.from_ocr,
          };
          return {
            citation:
              hit.sheet === null
                ? {
                    ...citedPassage,
                    pageFrom: hit.page_from,
                    pageTo: hit.page_to,
                  }
                : {
                    ...citedPassage,
                    sheet: hit.sheet,
                    cellRange: hit.cell_range,
                  },
            text: `document ${hit.dr_document_id}\n${hit.snippet}`,
          };
        }),
        null,
      );
    },
  });
  const rest = [
    documentTool({
      name: 'read_document_pages',
      description:
        'Read the text of a page range of one document, up to 32000 characters.',
      args: z.strictObject({
        document_id: documentIdArg,
        from_page: integerArg('a page number', 'First page to read.'),
        to_page: integerArg('a page number', 'Last page to read.'),
      }),
      run: async (context: C, args) => {
        const document = await reads.citedDocument(context, args.document_id);
        const data = await reads.readPages(context, args);
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
            fromOcr: row.from_ocr,
          },
          text: row.text,
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
      run: async (context: C, args) => {
        const document = await reads.citedDocument(context, args.document_id);
        const sheets = await reads.listSheets(context, args.document_id);
        if (!sheets.some(({ sheet }) => sheet === args.sheet)) {
          throw new ToolError(
            `${document.documentName} has no sheet "${args.sheet}".`,
          );
        }
        if (!A1_RANGE.test(args.a1_range)) {
          throw new ToolError(`"${args.a1_range}" is not an A1 range.`);
        }
        const data = await reads.readSheetRange(context, args);
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
            fromOcr: row.from_ocr,
          },
          text: row.text,
        }));
        const cutOff = first.truncated
          ? `${CUT_OFF} Read a smaller range to continue.`
          : null;
        return combine(passages, cutOff);
      },
    }),
    documentTool({
      name: 'list_documents',
      description: `List the latest version of each document in the ${reads.scope} that has text, with its id, page count or sheets.`,
      args: z.strictObject({}),
      run: async (context: C) => {
        const data = await reads.listDocuments(context);
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
      run: async (context: C, args) => {
        const document = await reads.citedDocument(context, args.document_id);
        const data = await reads.listSheets(context, args.document_id);
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
  return { searchDocuments, rest };
}

const dealReads: DocumentReads<DocumentToolContext> = {
  scope: 'deal',
  citedDocument: async ({ client, dealId }, documentId) => {
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
  },
  searchSegments: async ({ client, dealId }, args) =>
    (
      await client
        .rpc('search_document_segments', { deal_id: dealId, ...args })
        .throwOnError()
    ).data,
  readPages: async ({ client }, args) =>
    (await client.rpc('read_document_pages', args).throwOnError()).data,
  listSheets: async ({ client }, documentId) =>
    (
      await client
        .rpc('list_sheets', { document_id: documentId })
        .throwOnError()
    ).data,
  readSheetRange: async ({ client }, args) =>
    (await client.rpc('read_sheet_range', args).throwOnError()).data,
  listDocuments: async ({ client, dealId }) =>
    (await client.rpc('list_documents', { deal_id: dealId }).throwOnError())
      .data,
};

const searchPastAnswers = documentTool({
  name: 'search_past_answers',
  description:
    'Search questions already answered on this deal, by anyone on the team. Past answers are not sources and cannot be cited.',
  args: z.strictObject({
    query: stringArg('Words or phrases to search for.'),
  }),
  run: async ({ client, dealId }: DocumentToolContext, args) => {
    const { data } = await client
      .rpc('search_deal_ai_answers', {
        p_deal_id: dealId,
        p_query: args.query,
      })
      .throwOnError();
    if (data.length === 0) {
      return { content: 'No earlier answers.', citations: [] };
    }
    const { data: documents } = await client
      .from('dr_document')
      .select('id')
      .eq('deal_id', dealId)
      .throwOnError();
    const readable = new Set(documents.map(({ id }) => id));
    const answers = data.map((hit) => {
      const ocrLabels = parseStoredCitations(hit.citations, hit.question_id)
        .filter((citation) => citation.fromOcr)
        .map(citationLabel);
      const answer = ocrLabels.reduce(
        (text, label) =>
          text.replaceAll(`[${label}]`, `[${label}] ${OCR_MARK}`),
        withPartsText(
          hit.answer,
          parseStoredParts(hit.parts, hit.question_id),
          readable,
        ),
      );
      return `Question (asked ${hit.asked_at.slice(0, 10)}): ${hit.question}\nAnswer: ${answer}`;
    });
    return {
      content: [...answers, PAST_ANSWERS_ARE_NOT_SOURCES].join('\n\n'),
      citations: [],
    };
  },
});

export function scopedToolSet<C>(
  reads: DocumentReads<C>,
  ...extras: DocumentTool<C>[]
) {
  const { searchDocuments, rest } = readTools(reads);
  const tools = [searchDocuments, ...extras, ...rest];
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  return {
    definitions: tools.map(
      ({ name, description, inputSchema }): ToolDefinition => ({
        name,
        description,
        inputSchema,
      }),
    ),
    run: async (context: C, call: ToolCall): Promise<DocumentToolResult> => {
      const tool = byName.get(call.name);
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
    },
  };
}

const MOST_NOTE_CHARACTERS = 200;
const MOST_SHEET_CHARACTERS = 120;

const showDocument = documentTool({
  name: 'show_document',
  description:
    'Show the reader a card that links to one document in the data room. Use it when opening the document helps more than quoting it.',
  args: z
    .strictObject({
      document_id: documentIdArg,
      page: z
        .int({ error: 'a page number' })
        .min(1, { error: 'a page number of 1 or more' })
        .describe('Page to open the document at; leave out with sheet.')
        .optional(),
      sheet: z
        .string({ error: 'a string' })
        .max(MOST_SHEET_CHARACTERS, {
          error: `at most ${MOST_SHEET_CHARACTERS} characters`,
        })
        .describe('Sheet to open a workbook at; leave out with page.')
        .optional(),
      note: z
        .string({ error: 'a string' })
        .max(MOST_NOTE_CHARACTERS, {
          error: `at most ${MOST_NOTE_CHARACTERS} characters`,
        })
        .describe(
          `One short sentence on what the reader finds there, at most ${MOST_NOTE_CHARACTERS} characters.`,
        )
        .optional(),
    })
    .refine(({ page, sheet }) => page === undefined || sheet === undefined, {
      error: 'left out when page is given',
      path: ['sheet'],
    }),
  run: async (context: DocumentToolContext, { document_id, ...shown }) => {
    const document = await dealReads.citedDocument(context, document_id);
    return {
      content: `Card ready for ${document.documentName} v${document.version}.`,
      citations: [],
      part: { kind: 'document', v: 1, ...document, ...shown },
    };
  },
});

export const partTools: ReadonlySet<string> = new Set([showDocument.name]);

const dealTools = scopedToolSet(dealReads, searchPastAnswers);

export const documentTools: ToolDefinition[] = dealTools.definitions;

export const runDocumentTool = dealTools.run;

export const answerTools = scopedToolSet(
  dealReads,
  searchPastAnswers,
  showDocument,
);
