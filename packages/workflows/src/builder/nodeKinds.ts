export const AI_NODE_TYPES: readonly string[] = ['ask_ai', 'decision_model'];
export const DECISION_NODE_TYPES: readonly string[] = ['approval', 'decision_model'];

export const AI_PROVIDER_TIMEOUT_MS = 120_000;
export const AI_STEP_TIMEOUT = '150 seconds';
export const STEP_HEARTBEAT_TIMEOUT = '30 seconds';

export const SEARCH_NODE_TYPES: readonly string[] = ['diligence_search', 'diligence_report'];
export const SEARCH_STEP_TIMEOUT = '30 minutes';

export const HEARTBEAT_NODE_TYPES: readonly string[] = [...AI_NODE_TYPES, ...SEARCH_NODE_TYPES];
