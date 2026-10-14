import type { Enums } from '@odb/supabase';

export const roomStatusWording = {
  invited: 'Invited',
  reviewing: 'Reviewing',
  term_sheet: 'Term sheet',
  declined: 'Declined',
  selected: 'Selected',
} satisfies Record<Enums<'lender_room_status'>, string>;

export function countWording(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export const requestStatusWording = {
  open: 'Waiting on us',
  answered: 'Waiting on the lender',
  closed: 'Closed',
  withdrawn: 'Withdrawn',
} satisfies Record<Enums<'lender_ask_status'>, string>;

export const teamSignInPath = '/auth/sign-in';

export function personLabel(person: {
  name: string | null;
  email: string;
}): string {
  return person.name ? `${person.name} (${person.email})` : person.email;
}

export function waitingOnUsWording(count: number): string {
  return count > 0
    ? `${countWording(count, 'request', 'requests')} waiting on us`
    : 'No requests waiting on us';
}

export function waitingOnLenderWording(count: number): string {
  return count > 0
    ? `${countWording(count, 'request', 'requests')} waiting on the lender`
    : 'No requests waiting on the lender';
}
