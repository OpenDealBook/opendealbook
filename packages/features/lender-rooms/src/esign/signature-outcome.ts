import type { SignatureState } from '@odb/contracts/esign';
import type { Enums } from '@odb/supabase';

type SignatureStatus = Enums<'lender_signature_status'>;

interface Transition {
  from: readonly SignatureStatus[];
  to: Exclude<SignatureStatus, 'draft' | 'cancelled'>;
}

const OPEN = ['draft', 'sent'] as const;

const declined: Transition = { from: OPEN, to: 'declined' };

const TRANSITION_OF_STATE: Record<SignatureState, Transition | null> = {
  draft: null,
  sent: { from: ['draft'], to: 'sent' },
  completed: { from: [...OPEN, 'declined', 'expired'], to: 'completed' },
  rejected: declined,
  cancelled: declined,
  missing: declined,
  expired: { from: OPEN, to: 'expired' },
};

export function signatureTransition(
  current: SignatureStatus,
  state: SignatureState,
): Transition | null {
  const transition = TRANSITION_OF_STATE[state];

  return transition?.from.includes(current) ? transition : null;
}
