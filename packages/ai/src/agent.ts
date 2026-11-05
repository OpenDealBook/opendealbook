import {
  CapReached,
  type ConversationMessage,
  converseMetered,
  type TeamAi,
  type ToolCall,
  type ToolDefinition,
} from '@odb/workflows/team-ai';

import type { DocumentCitation } from './citations';
import {
  type DocumentToolContext,
  type DocumentToolResult,
  documentTools,
  runDocumentTool,
} from './tools';

const TOOL_ROUNDS = 8;
const CALLS_PER_TURN = 5;
const TOO_MANY_CALLS = 'Too many tool calls in one turn; ask again';
const UNEXPECTED_FAILURE = 'The question could not be answered';
const NO_ANSWER = 'The AI returned no answer';
const TEAM_READ_ONLY = 'Team is read-only';
const CITATION = / ?\[([^[\]]+ v\d+, [^[\]]+)\]/g;
const LABEL =
  /^(.+) v(\d+), (?:p\. (\d+)(?:-(\d+))?|(.+)!([A-Z]+\d+(?::[A-Z]+\d+)?))$/;
const CELL = /^([A-Z]+)(\d+)$/;

export interface DealQuestion extends DocumentToolContext {
  askedBy: string;
  questionId: string;
  question: string;
  earlier: { question: string; answer: string }[];
}

export interface AnswerMode {
  system: string;
  tools: ToolDefinition[];
  runTool: (
    context: DocumentToolContext,
    call: ToolCall,
  ) => Promise<DocumentToolResult>;
}

interface ToolStep {
  tool: string;
  input: unknown;
  isError: boolean;
}

interface Run {
  model: string;
  credits: number;
  steps: ToolStep[];
}

export type QuestionOutcome =
  | (Run & {
      status: 'answered';
      answer: string;
      citations: DocumentCitation[];
    })
  | (Run & { status: 'credits_ran_out' })
  | (Run & { status: 'failed'; reason: string });

type CitedRange =
  | { pageFrom: number; pageTo: number }
  | { sheet: string; cellRange: string };

type Span = [number, number];

export function dealQuestionMode({
  dealName,
  locale,
}: {
  dealName: string;
  locale: string;
}): AnswerMode {
  const language = new Intl.DisplayNames(['en'], { type: 'language' }).of(
    locale,
  );
  const system = [
    `You answer questions about the deal "${dealName}" from its documents.`,
    'Use the tools to find and read the documents before you answer.',
    `Answer in ${language}.`,
    'Cite each fact with the bracketed label exactly as the tools showed it.',
    'Cite only labels the tools showed you.',
    'Text marked as OCR text has lower confidence; say so when an answer rests on it.',
  ].join('\n');
  return {
    system,
    tools: documentTools,
    runTool: runDocumentTool,
  };
}

function inside([from, to]: Span, [readFrom, readTo]: Span): boolean {
  return from >= readFrom && to <= readTo;
}

function columnNumber(letters: string): number {
  return [...letters].reduce(
    (total, letter) => total * 26 + letter.charCodeAt(0) - 64,
    0,
  );
}

function cellSpans(range: string): { columns: Span; rows: Span } {
  const [from, to = from] = range
    .replaceAll('$', '')
    .split(':')
    .map((cell) => {
      const [, column, row] = CELL.exec(cell)!;
      return { column: columnNumber(column!), row: Number(row) };
    });
  return {
    columns: [from!.column, to!.column],
    rows: [from!.row, to!.row],
  };
}

function within(cited: CitedRange, read: DocumentCitation): boolean {
  if ('pageFrom' in cited) {
    return (
      'pageFrom' in read &&
      inside([cited.pageFrom, cited.pageTo], [read.pageFrom, read.pageTo])
    );
  }
  if (!('sheet' in read) || read.sheet !== cited.sheet) {
    return false;
  }
  const citedCells = cellSpans(cited.cellRange);
  const readCells = cellSpans(read.cellRange);
  return (
    inside(citedCells.columns, readCells.columns) &&
    inside(citedCells.rows, readCells.rows)
  );
}

function citationOf(
  label: string,
  read: DocumentCitation[],
): DocumentCitation | undefined {
  const match = LABEL.exec(label);
  if (!match) {
    return undefined;
  }
  const [, documentName, version, pageFrom, pageTo, sheet, cellRange] = match;
  const cited: CitedRange = pageFrom
    ? { pageFrom: Number(pageFrom), pageTo: Number(pageTo ?? pageFrom) }
    : { sheet: sheet!, cellRange: cellRange! };
  const source = read.find(
    (citation) =>
      citation.documentName === documentName &&
      citation.version === Number(version) &&
      within(cited, citation),
  );
  return (
    source && {
      documentId: source.documentId,
      documentName: source.documentName,
      version: source.version,
      excerpt: source.excerpt,
      ...cited,
    }
  );
}

function keptCitations(
  text: string,
  read: DocumentCitation[],
): { answer: string; citations: DocumentCitation[] } {
  const cited = new Map<string, DocumentCitation>();
  const answer = text.replace(CITATION, (whole, label: string) => {
    const citation = citationOf(label, read);
    if (!citation) {
      return '';
    }
    cited.set(label, citation);
    return whole;
  });
  return { answer, citations: [...cited.values()] };
}

function failureReason(error: unknown): string {
  return error instanceof Error &&
    error.name === 'ApplicationFailure' &&
    'nonRetryable' in error &&
    error.nonRetryable === true
    ? error.message
    : UNEXPECTED_FAILURE;
}

export async function answerWithDocuments(
  ai: TeamAi,
  question: DealQuestion,
  mode: AnswerMode,
  onProgress: (step: Omit<ToolStep, 'isError'>) => void,
): Promise<QuestionOutcome> {
  const run: Run = { model: ai.model, credits: 0, steps: [] };
  const read: DocumentCitation[] = [];
  const messages: ConversationMessage[] = [
    ...question.earlier.flatMap(
      ({ question: asked, answer }): ConversationMessage[] => [
        { role: 'user', text: asked },
        { role: 'assistant', text: answer, toolCalls: [] },
      ],
    ),
    { role: 'user', text: question.question },
  ];

  try {
    for (let round = 0; ; round += 1) {
      const { data: locked } = await question.client
        .rpc('is_account_locked', { target_account_id: ai.accountId })
        .throwOnError();
      if (locked) {
        return { status: 'failed', ...run, reason: TEAM_READ_ONLY };
      }
      const lastRound = round === TOOL_ROUNDS;
      const { turn, credits } = await converseMetered(ai, question, {
        system: mode.system,
        messages,
        tools: mode.tools,
        toolChoice: lastRound ? 'none' : undefined,
      });
      run.credits += credits;
      if (lastRound || turn.toolCalls.length === 0) {
        const kept = keptCitations(turn.text, read);
        return kept.answer.trim() === ''
          ? { status: 'failed', ...run, reason: NO_ANSWER }
          : { status: 'answered', ...run, ...kept };
      }
      messages.push({
        role: 'assistant',
        text: turn.text,
        toolCalls: turn.toolCalls,
      });
      for (const [index, call] of turn.toolCalls.entries()) {
        if (index >= CALLS_PER_TURN) {
          messages.push({
            role: 'tool',
            toolCallId: call.id,
            content: TOO_MANY_CALLS,
            isError: true,
          });
          continue;
        }
        const step = { tool: call.name, input: call.input, isError: true };
        run.steps.push(step);
        onProgress({ tool: call.name, input: call.input });
        const result: DocumentToolResult = mode.tools.some(
          ({ name }) => name === call.name,
        )
          ? await mode.runTool(question, call)
          : {
              content: `Unknown tool "${call.name}".`,
              isError: true,
              citations: [],
            };
        step.isError = result.isError === true;
        read.push(...result.citations);
        messages.push({
          role: 'tool',
          toolCallId: call.id,
          content: result.content,
          isError: result.isError,
        });
      }
    }
  } catch (error) {
    if (error instanceof CapReached) {
      return { status: 'credits_ran_out', ...run };
    }
    return { status: 'failed', ...run, reason: failureReason(error) };
  }
}
