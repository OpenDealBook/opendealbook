import { expectTypeOf, it } from 'vitest';

import type { ToolCall } from '@odb/workflows/team-ai';

import { type AnswerMode, dealQuestionMode } from './agent';
import type { DocumentToolContext } from './tools';

it('lets a mode read only through the client and deal of the question it answers', () => {
  expectTypeOf(dealQuestionMode).parameters.toEqualTypeOf<
    [{ dealName: string; locale: string }]
  >();
  expectTypeOf<Parameters<AnswerMode['runTool']>>().toEqualTypeOf<
    [DocumentToolContext, ToolCall]
  >();
});
