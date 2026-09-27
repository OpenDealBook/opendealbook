export { parseFirmCsv } from './import/parse';
export { dedupeFirms } from './import/dedupe';
export { websiteKey, phoneKey } from './import/normalize';
export type {
  FirmFieldMapping,
  FirmImportField,
  NormalizedFirmRow,
  ExistingFirmKey,
} from './import/types';

export { scoreFirm } from './scoring/score';
export type { ScorableFirm } from './scoring/score';
export { dealBoxCriteriaSchema } from './scoring/criteria';
export type { DealBoxCriteria } from './scoring/criteria';

export { canTransition, nextStates } from './state-machine';
export type { FirmStatus } from './state-machine';
