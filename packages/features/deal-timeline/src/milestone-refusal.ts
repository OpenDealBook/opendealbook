import { Refusal } from '@odb/lender-rooms/actions/refusal.ts';
import { TEAM_READ_ONLY } from '@odb/next';

function refusalFor({ code, message }: { code?: string; message: string }) {
  if (code === '23514') {
    return 'An actual date cannot be in the future.';
  }

  if (code === '23505') {
    return 'Someone just set this milestone. Refresh and try again.';
  }

  if (code === '42501') {
    return message === 'team is read-only'
      ? TEAM_READ_ONLY
      : 'You cannot change the timeline on this deal.';
  }

  return null;
}

export function throwAsMilestoneRefusal(error: unknown): never {
  const refusal = refusalFor(error as { code?: string; message: string });

  if (refusal === null) {
    throw error;
  }

  throw new Refusal(refusal);
}
