import {
  CapReached,
  type ConversationMessage,
  converseMetered,
  type MeteringSubject,
  type TeamAi,
  type ToolCall,
  type ToolDefinition,
} from '@odb/workflows/team-ai';

import type { DocumentCitation } from './citations';
import type { AnswerPart } from './parts';
import {
  answerTools,
  type DocumentToolContext,
  type DocumentToolResult,
  partTools,
} from './tools';

const TOOL_ROUNDS = 8;
const CALLS_PER_TURN = 5;
const TOO_MANY_CALLS = 'Too many tool calls in one turn; ask again';
const MOST_PARTS = 3;
const TOO_MANY_PARTS = `An answer holds at most ${MOST_PARTS} cards; place the ones you have.`;
const UNEXPECTED_FAILURE = 'The question could not be answered';
const NO_ANSWER = 'The AI returned no answer';
const TEAM_READ_ONLY = 'Team is read-only';
const BRACKETED = / ?\[([^[\]\n\r\u2028\u2029]+)\]/g;
const CITATION_SHAPE = /. v\d+, ./;
const PAGE_LABEL = /^(.+) v(\d+), p\. (\d+)(?:-(\d+))?$/;
const CELL_RANGE = /!([A-Z]+\d+(?::[A-Z]+\d+)?)$/;
const SHEET_LABEL = /^(.+) v(\d+), (.+)$/;
const CELL = /^([A-Z]+)(\d+)$/;

export interface DealQuestion extends DocumentToolContext {
  askedBy: string;
  subject: MeteringSubject;
  question: string;
  earlier: { question: string; answer: string }[];
}

export interface FinishTool<T> {
  tool: ToolDefinition;
  accept: (
    input: unknown,
    cite: (label: string) => DocumentCitation | undefined,
  ) => { value: T } | { error: string };
}

export interface AnswerMode<T = never> {
  system: string;
  tools: ToolDefinition[];
  runTool: (
    context: DocumentToolContext,
    call: ToolCall,
  ) => Promise<DocumentToolResult>;
  finish?: [T] extends [never] ? undefined : FinishTool<T>;
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
      parts: AnswerPart[];
    })
  | (Run & { status: 'credits_ran_out' })
  | (Run & { status: 'failed'; reason: string });

export type FinishOutcome<T> =
  | (Run & { status: 'finished'; value: T })
  | (Run & { status: 'ran_out' })
  | (Run & { status: 'no_submit' })
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
    tools: answerTools.definitions,
    runTool: answerTools.run,
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

function labelled(
  label: string,
): { documentName?: string; version: number; cited: CitedRange } | undefined {
  const pageLabel = PAGE_LABEL.exec(label);
  if (pageLabel) {
    const [, documentName, version, pageFrom, pageTo = pageFrom] = pageLabel;
    return {
      documentName,
      version: Number(version),
      cited: { pageFrom: Number(pageFrom), pageTo: Number(pageTo) },
    };
  }
  const cellRange = CELL_RANGE.exec(label);
  const sheetLabel =
    cellRange && SHEET_LABEL.exec(label.slice(0, cellRange.index));
  if (!cellRange || !sheetLabel) {
    return undefined;
  }
  const [, documentName, version, sheet] = sheetLabel;
  const [, range] = cellRange;
  return {
    documentName,
    version: Number(version),
    cited: { sheet: sheet!, cellRange: range! },
  };
}

function citationOf(
  label: string,
  read: DocumentCitation[],
): DocumentCitation | undefined {
  const parsed = labelled(label);
  if (!parsed) {
    return undefined;
  }
  const { documentName, version, cited } = parsed;
  const source = read.find(
    (citation) =>
      citation.documentName === documentName &&
      citation.version === version &&
      within(cited, citation),
  );
  return (
    source && {
      documentId: source.documentId,
      documentName: source.documentName,
      version: source.version,
      excerpt: source.excerpt,
      fromOcr: source.fromOcr,
      ...cited,
    }
  );
}

export function citationLabelsIn(text: string): string[] {
  return [...text.matchAll(BRACKETED)]
    .map(([, label]) => label!)
    .filter((label) => CITATION_SHAPE.test(label));
}

export function keptCitations(
  text: string,
  read: DocumentCitation[],
): { answer: string; citations: DocumentCitation[] } {
  const cited = new Map<string, DocumentCitation>();
  const answer = text.replace(BRACKETED, (whole, label: string) => {
    if (!CITATION_SHAPE.test(label)) {
      return whole;
    }
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

function placePart(
  content: string,
  part: Omit<AnswerPart, 'id'>,
  parts: AnswerPart[],
): string {
  const id = parts.length + 1;
  parts.push({ ...part, id });
  return `${content} Write [[figure ${id}]] on its own line where it belongs in your answer.`;
}

type OnProgress = (step: Omit<ToolStep, 'isError'>) => void;

export function answerWithDocuments(
  ai: TeamAi,
  question: DealQuestion,
  mode: AnswerMode,
  onProgress: OnProgress,
): Promise<QuestionOutcome>;
export function answerWithDocuments<T>(
  ai: TeamAi,
  question: DealQuestion,
  mode: AnswerMode<T> & { finish: FinishTool<T> },
  onProgress: OnProgress,
): Promise<FinishOutcome<T>>;
export async function answerWithDocuments(
  ai: TeamAi,
  question: DealQuestion,
  mode: AnswerMode<unknown>,
  onProgress: OnProgress,
): Promise<QuestionOutcome | FinishOutcome<unknown>> {
  const { finish } = mode;
  const run: Run = { model: ai.model, credits: 0, steps: [] };
  const read: DocumentCitation[] = [];
  const parts: AnswerPart[] = [];
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
      const offered = !finish
        ? mode.tools
        : lastRound
          ? [finish.tool]
          : [...mode.tools, finish.tool];
      const { turn, credits } = await converseMetered(ai, question, {
        system: mode.system,
        messages,
        tools: offered,
        toolChoice: lastRound && !finish ? 'none' : undefined,
      });
      run.credits += credits;
      if (!finish && (lastRound || turn.toolCalls.length === 0)) {
        const kept = keptCitations(turn.text, read);
        return kept.answer.trim() === ''
          ? { status: 'failed', ...run, reason: NO_ANSWER }
          : { status: 'answered', ...run, ...kept, parts };
      }
      if (turn.toolCalls.length === 0) {
        return { status: 'no_submit', ...run };
      }
      messages.push({
        role: 'assistant',
        text: turn.text,
        toolCalls: turn.toolCalls,
      });
      const submits = turn.toolCalls.filter(
        ({ name }) => name === finish?.tool.name,
      );
      const reads = turn.toolCalls.filter(
        ({ name }) => name !== finish?.tool.name,
      );
      for (const [index, call] of reads.entries()) {
        const refusal =
          index >= CALLS_PER_TURN
            ? TOO_MANY_CALLS
            : partTools.has(call.name) && parts.length === MOST_PARTS
              ? TOO_MANY_PARTS
              : null;
        if (refusal) {
          messages.push({
            role: 'tool',
            toolCallId: call.id,
            content: refusal,
            isError: true,
          });
          continue;
        }
        const step = { tool: call.name, input: call.input, isError: true };
        run.steps.push(step);
        onProgress({ tool: call.name, input: call.input });
        const result: DocumentToolResult = offered.some(
          ({ name }) => name === call.name,
        )
          ? await mode.runTool(question, call)
          : {
              content: `Unknown tool "${call.name}".`,
              isError: true,
              citations: [],
            };
        const toolReply = result.part
          ? placePart(result.content, result.part, parts)
          : result.content;
        step.isError = result.isError === true;
        read.push(...result.citations);
        messages.push({
          role: 'tool',
          toolCallId: call.id,
          content: toolReply,
          isError: result.isError,
        });
      }
      for (const call of submits) {
        const step = { tool: call.name, input: call.input, isError: true };
        run.steps.push(step);
        onProgress({ tool: call.name, input: call.input });
        const verdict = finish!.accept(call.input, (label) =>
          citationOf(label, read),
        );
        if ('value' in verdict) {
          step.isError = false;
          return { status: 'finished', ...run, value: verdict.value };
        }
        messages.push({
          role: 'tool',
          toolCallId: call.id,
          content: verdict.error,
          isError: true,
        });
      }
      if (lastRound) {
        return { status: 'ran_out', ...run };
      }
    }
  } catch (error) {
    if (error instanceof CapReached) {
      return { status: 'credits_ran_out', ...run };
    }
    return { status: 'failed', ...run, reason: failureReason(error) };
  }
}
