export type DealQuestionRefusal =
  | 'unauthenticated'
  | 'invalid_request'
  | 'empty_question'
  | 'question_too_long'
  | 'unknown_locale'
  | 'deal_not_found'
  | 'not_deal_team'
  | 'team_read_only'
  | 'thread_not_found'
  | 'connect_ai_provider'
  | 'already_running'
  | 'thread_full';

export type DealQuestionStreamError = 'save_failed';

export type DealQuestionErrorCode =
  | DealQuestionRefusal
  | DealQuestionStreamError;
