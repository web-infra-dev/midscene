import { isAgentAIContextKey } from '@midscene/shared/agent-tools/agent-context';
import { assertReportGenerationOptions } from '../report-generator';
import type { AgentAIContexts, AgentOpt } from '../types';

export function withAgentDefaults(opts?: AgentOpt): AgentOpt {
  const options = Object.assign(
    {
      generateReport: true,
      persistExecutionDump: false,
      autoPrintReportMsg: true,
      groupName: 'Midscene Report',
      groupDescription: '',
    },
    opts || {},
  );
  assertReportGenerationOptions(options);
  return options;
}

export function normalizeAgentOptions(
  options: AgentOpt,
  warn: (message: string) => void,
): void {
  if (
    options.aiContexts !== undefined &&
    (typeof options.aiContexts !== 'object' ||
      options.aiContexts === null ||
      Array.isArray(options.aiContexts))
  ) {
    throw new TypeError('opts.aiContexts must be a plain object');
  }

  for (const [key, value] of Object.entries(options.aiContexts ?? {})) {
    if (!isAgentAIContextKey(key)) {
      throw new TypeError(`Unknown Agent context key: ${key}`);
    }
    if (value !== undefined && typeof value !== 'string') {
      throw new TypeError(`Agent context "${key}" must be a string`);
    }
  }

  const deprecatedAiActContextOption =
    options.aiActContext !== undefined
      ? 'aiActContext'
      : options.aiActionContext !== undefined
        ? 'aiActionContext'
        : undefined;
  if (deprecatedAiActContextOption) {
    warn(
      `Agent option "${deprecatedAiActContextOption}" is deprecated; use "aiContexts.aiAct" instead. When both are provided, "aiContexts.aiAct" takes precedence.`,
    );
  }

  const normalizedAIContexts: AgentAIContexts = { ...options.aiContexts };
  const resolvedAiActContext =
    normalizedAIContexts.aiAct ??
    options.aiActContext ??
    options.aiActionContext;
  if (resolvedAiActContext !== undefined) {
    normalizedAIContexts.aiAct = resolvedAiActContext;
    options.aiActContext = resolvedAiActContext;
    options.aiActionContext = resolvedAiActContext;
  }
  options.aiContexts = normalizedAIContexts;

  if (
    options.modelConfig &&
    (typeof options.modelConfig !== 'object' ||
      Array.isArray(options.modelConfig))
  ) {
    throw new Error(
      `opts.modelConfig must be a plain object map of env keys to values, but got ${typeof options.modelConfig}`,
    );
  }
}
