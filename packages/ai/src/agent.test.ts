import { describe, expect, expectTypeOf, it } from 'vitest';

import type { TeamAi, ToolCall } from '@odb/workflows/team-ai';

import {
  type AnswerMode,
  answerWithDocuments,
  citationLabelsIn,
  type DealQuestion,
  dealQuestionMode,
  type FinishOutcome,
  type FinishTool,
  keptCitations,
  type QuestionOutcome,
} from './agent';
import { type DocumentToolContext, runDocumentTool } from './tools';

it('lets a mode read only through the client and deal of the question it answers', () => {
  expectTypeOf(dealQuestionMode).parameters.toEqualTypeOf<
    [{ dealName: string; locale: string }]
  >();
  expectTypeOf<Parameters<AnswerMode['runTool']>>().toEqualTypeOf<
    [DocumentToolContext, ToolCall]
  >();
});

it('gives a mode without a finish tool the answer outcomes and a mode with one the finish outcomes', () => {
  const question = {} as DealQuestion;
  const ai = {} as TeamAi;
  const finish: FinishTool<{ overall: string }> = {
    tool: { name: 'submit_check', description: '', inputSchema: {} },
    accept: () => ({ value: { overall: 'consistent' } }),
  };
  const answer = () =>
    answerWithDocuments(
      ai,
      question,
      dealQuestionMode({ dealName: 'Acme Plumbing', locale: 'en' }),
      () => {},
    );
  const check = () =>
    answerWithDocuments(
      ai,
      question,
      { system: '', tools: [], runTool: runDocumentTool, finish },
      () => {},
    );

  expectTypeOf(answer).returns.resolves.toEqualTypeOf<QuestionOutcome>();
  expectTypeOf<QuestionOutcome['status']>().toEqualTypeOf<
    'answered' | 'credits_ran_out' | 'failed'
  >();
  expectTypeOf(check).returns.resolves.toEqualTypeOf<
    FinishOutcome<{ overall: string }>
  >();
  expectTypeOf<FinishOutcome<unknown>['status']>().toEqualTypeOf<
    'finished' | 'ran_out' | 'no_submit' | 'credits_ran_out' | 'failed'
  >();
});

it('does not let a plain mode carry a finish tool', () => {
  const untyped: AnswerMode = {
    system: '',
    tools: [],
    runTool: runDocumentTool,
    // @ts-expect-error a finish tool needs a mode typed with its value
    finish: {
      tool: { name: 'submit_check', description: '', inputSchema: {} },
      accept: () => ({ error: 'Not checked.' }),
    },
  };

  expectTypeOf(untyped.finish).toEqualTypeOf<undefined>();
});

describe('citationLabelsIn', () => {
  it('finds each bracketed text shaped like a citation label, on one line', () => {
    expect(
      citationLabelsIn(
        'Revenue [cim.pdf v1, p. 2] [note] [x v1, y]\n[a v1,\n b] [model.xlsx v2, P&L!A1] [a] b]',
      ),
    ).toEqual(['cim.pdf v1, p. 2', 'x v1, y', 'model.xlsx v2, P&L!A1']);
  });
});

describe('keptCitations', () => {
  const read = [
    {
      documentId: 'd1',
      documentName: 'cim.pdf',
      version: 1,
      excerpt: 'Revenue was 1.4 million.',
      fromOcr: false,
      pageFrom: 1,
      pageTo: 3,
    },
  ];
  const fastest = (text: string) => {
    let best = Infinity;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const started = performance.now();
      keptCitations(text, read);
      best = Math.min(best, performance.now() - started);
    }
    return best;
  };
  const labels = (count: number) => 'a v1, '.repeat(count);

  it.each([
    ['an unclosed bracket', (n: number) => `Revenue [${labels(n)}`, true],
    ['a closed bracket', (n: number) => `Revenue [${labels(n)}x].`, false],
    ['a sheet label', (n: number) => `Revenue [${labels(n)}S!A1].`, false],
    [
      'a label broken by a newline',
      (n: number) => `Revenue [${labels(n)}\n!A1].`,
      true,
    ],
    [
      'a label broken by a carriage return',
      (n: number) => `Revenue [${labels(n)}\r!A1].`,
      true,
    ],
  ])(
    'reads an answer with %s in time linear in its length',
    (_, answerOf, keepsText) => {
      fastest(answerOf(8_000));
      const ratio = fastest(answerOf(32_000)) / fastest(answerOf(8_000));

      expect(ratio).toBeLessThan(8);
      expect(keptCitations(answerOf(8_000), read)).toEqual({
        answer: keepsText ? answerOf(8_000) : 'Revenue.',
        citations: [],
      });
    },
  );

  it('keeps labels a tool read, drops other label-shaped brackets, and leaves other brackets alone', () => {
    expect(
      keptCitations(
        'Revenue [cim.pdf v1, p. 2] [cim.pdf v1, p. 9] [note] [x v1, y] [a] b]',
        read,
      ),
    ).toEqual({
      answer: 'Revenue [cim.pdf v1, p. 2] [note] [a] b]',
      citations: [{ ...read[0], pageFrom: 2, pageTo: 2 }],
    });
  });
});
