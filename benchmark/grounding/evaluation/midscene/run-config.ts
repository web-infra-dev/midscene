import type { MidsceneRunConfig } from './types.js';

export const DEFAULT_MIDSCENE_RUN_CONFIG: MidsceneRunConfig = {
  meta: {
    title: '',
    objective: '',
    note: '',
  },
  selection: {
    modelIds: [],
    caseNames: [],
    excludeCaseNames: [],
    imageTypes: ['hd'],
    promptSource: 'primary',
  },
  execution: {
    iterations: 1,
    providerConcurrency: 1,
    runId: '',
  },
  locate: {
    useDeepLocate: false,
    implementation: 'aiLocate',
    aiActDeepThink: false,
  },
  modelConfig: {},
  debug: {
    enableLangSmith: false,
  },
};
