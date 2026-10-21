import {
  forgottenIds,
  reportStoreFailure,
  unfinishedStore,
} from './unfinished-store';
import { createUnfinishedMemory } from './unfinished-uploads';

export const unfinishedMemory = createUnfinishedMemory({
  store: unfinishedStore,
  forgotten: forgottenIds,
  report: reportStoreFailure,
});
