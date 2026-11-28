export type LenderAskDraftRefusal =
  | 'unauthenticated'
  | 'invalid_request'
  | 'unknown_locale'
  | 'ask_not_found'
  | 'team_read_only'
  | 'connect_ai_provider'
  | 'form_ask'
  | 'ask_closed'
  | 'attachments_processing'
  | 'already_running';

export type LenderAskDraftStreamError = 'save_failed' | 'stream_failed';

export type LenderAskDraftErrorCode =
  | LenderAskDraftRefusal
  | LenderAskDraftStreamError;
