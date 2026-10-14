import type { Enums, Tables } from '@odb/supabase';

import { Refusal } from '../actions/refusal';

type AskStatus = Enums<'lender_ask_status'>;

interface Rule {
  from: readonly AskStatus[];
  to: AskStatus;
  onlyBeforeFirstResponse?: true;
  isResponse?: true;
}

const everyStatus = ['open', 'answered', 'closed', 'withdrawn'] as const;
const closable = ['open', 'answered', 'withdrawn'] as const;

const rules = {
  lender: {
    reply: { from: everyStatus, to: 'open' },
    close: { from: closable, to: 'closed' },
    edit: { from: ['open'], to: 'open', onlyBeforeFirstResponse: true },
    withdraw: {
      from: ['open'],
      to: 'withdrawn',
      onlyBeforeFirstResponse: true,
    },
  },
  internal: {
    reply: { from: everyStatus, to: 'answered', isResponse: true },
    close: { from: closable, to: 'closed', isResponse: true },
  },
} satisfies Record<Enums<'lender_side'>, Record<string, Rule>>;

export type AskState = Pick<
  Tables<'lender_ask'>,
  'status' | 'first_response_at'
>;

export type AskMove = {
  [Side in keyof typeof rules]: {
    side: Side;
    kind: keyof (typeof rules)[Side];
  };
}[keyof typeof rules];

export interface MoveWording {
  noun: string;
  action?: string;
}

export function transitionAsk(
  state: AskState,
  move: AskMove,
  at: string,
  { noun, action = `${move.kind} this ${noun}` }: MoveWording = {
    noun: 'request',
  },
): AskState {
  const rule: Rule =
    move.side === 'lender'
      ? rules.lender[move.kind]
      : rules.internal[move.kind];

  if (rule.onlyBeforeFirstResponse && state.first_response_at) {
    throw new Refusal(
      `You can no longer ${action} because the deal team has responded`,
    );
  }

  if (!rule.from.includes(state.status)) {
    throw new Refusal(
      state.status === rule.to
        ? `This ${noun} is already ${state.status}`
        : `You can no longer ${action} because it is ${state.status}`,
    );
  }

  return {
    status: rule.to,
    first_response_at: rule.isResponse
      ? (state.first_response_at ?? at)
      : state.first_response_at,
  };
}
