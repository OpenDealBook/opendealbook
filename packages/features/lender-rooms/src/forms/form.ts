import type { Tables } from '@odb/supabase';

export const FORM_COLUMNS =
  'id, room_id, account_id, kind, status, first_response_at, return_route';

export type LoadedForm = Pick<
  Tables<'lender_ask'>,
  | 'id'
  | 'room_id'
  | 'account_id'
  | 'kind'
  | 'status'
  | 'first_response_at'
  | 'return_route'
>;

export const FORM_NOT_FOUND = 'That form was not found';

export const formWording = { noun: 'form' };
