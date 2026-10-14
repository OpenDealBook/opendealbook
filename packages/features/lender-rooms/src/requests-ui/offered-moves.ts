import { type AskMove, type AskState, transitionAsk } from '../asks/transition';

type LenderMove = Extract<AskMove, { side: 'lender' }>['kind'];

const lenderMoves = [
  'reply',
  'edit',
  'withdraw',
  'close',
] as const satisfies LenderMove[];

export function offeredMoves(state: AskState): LenderMove[] {
  return lenderMoves.filter((kind) => {
    // transitionAsk is the one statement of the rules and it answers by throwing, so asking it is how a move is known to be allowed.
    try {
      transitionAsk(
        state,
        { side: 'lender', kind },
        state.first_response_at ?? '',
      );
      return true;
    } catch {
      return false;
    }
  });
}
