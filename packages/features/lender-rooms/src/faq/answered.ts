import type { Enums } from '@odb/supabase';

export function canAddToFaq(ask: {
  status: Enums<'lender_ask_status'>;
  messages: { side: Enums<'lender_side'> }[];
}): boolean {
  return (
    ask.status === 'answered' ||
    (ask.status === 'closed' &&
      ask.messages.some((message) => message.side === 'internal'))
  );
}
