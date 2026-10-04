import 'server-only';

export { extractStructuredFromDocument } from './extract';
export type {
  DocumentExtractionInput,
  DocumentExtractionResult,
} from './extract';
export { answerDealQuestion } from './generate';
export type {
  Citation,
  DealQuestionInput,
  DealQuestionResult,
} from './generate';
export { generateStructured } from './structured';
export type { StructuredGenerateInput } from './structured';
