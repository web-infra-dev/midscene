import type {
  CodexAppServerCallInput,
  CodexAppServerParamsResult,
} from './types';

export const buildDefaultCodexAppServerParams = ({
  userConfig = {},
}: CodexAppServerCallInput): CodexAppServerParamsResult => {
  if (userConfig.reasoningEnabled !== true) {
    return { config: { effort: 'none' } };
  }

  const effort = userConfig.reasoningEffort?.trim().toLowerCase();
  return {
    config: {
      effort:
        effort &&
        ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'].includes(effort)
          ? effort
          : 'medium',
    },
  };
};
