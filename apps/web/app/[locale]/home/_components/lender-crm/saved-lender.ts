import type { Tables } from '@odb/supabase';

export type SavedContact = Pick<
  Tables<'lender_contact'>,
  'id' | 'name' | 'email' | 'phone' | 'is_primary'
>;

export type SavedLender = Pick<
  Tables<'lender'>,
  | 'id'
  | 'name'
  | 'website'
  | 'rate_type'
  | 'typical_rate'
  | 'max_loan'
  | 'sba_preferred'
  | 'industries'
  | 'states'
  | 'tags'
  | 'notes'
> & { lender_contact: SavedContact[] };

export const SAVED_LENDER_COLUMNS =
  'id, name, website, rate_type, typical_rate, max_loan, sba_preferred, industries, states, tags, notes, lender_contact(id, name, email, phone, is_primary)';

export const RATE_TYPE_WORDING = {
  fixed: 'Fixed',
  variable: 'Variable',
  either: 'Fixed or variable',
} as const;

export function dollars(amount: number) {
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}
