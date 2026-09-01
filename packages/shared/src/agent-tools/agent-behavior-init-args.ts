import { z } from 'zod';
import {
  AGENT_CONTEXT_KEYS,
  type AgentContexts,
  isAgentContextKey,
} from './agent-context';

export interface AgentBehaviorInitArgs {
  /**
   * Agent-level AI guidance. `default` is used only when neither the current
   * call nor its API key provides a context. Values override rather than
   * implicitly concatenate.
   */
  contexts?: AgentContexts;
  /**
   * Compatibility alias for `contexts.aiAct`; that field wins when both exist.
   * @deprecated Use `contexts.aiAct` instead.
   */
  aiActContext?: string;
  /**
   * Older compatibility alias for `contexts.aiAct`.
   * @deprecated Use `contexts.aiAct` instead.
   */
  aiActionContext?: string;
  replanningCycleLimit?: number;
  waitAfterAction?: number;
  screenshotShrinkFactor?: number;
}

type ExposedAgentBehaviorInitArgKey = Exclude<
  keyof AgentBehaviorInitArgs,
  'aiActionContext'
>;

export const agentBehaviorInitArgShape = {
  contexts: z
    .record(z.enum(AGENT_CONTEXT_KEYS), z.string())
    .optional()
    .describe(
      'Additional AI guidance such as business facts, rules, constraints, or output requirements. contexts.default is used only when neither the call nor its API key provides a context. Values override rather than implicitly concatenate.',
    ),
  aiActContext: z
    .string()
    .optional()
    .describe(
      'Deprecated compatibility alias for contexts.aiAct. contexts.aiAct takes precedence when both are provided.',
    ),
  replanningCycleLimit: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe(
      'Maximum number of replanning cycles for aiAct. Default: model adapter default.',
    ),
  waitAfterAction: z
    .number()
    .nonnegative()
    .optional()
    .describe(
      'Wait time in milliseconds after each action execution. Default: 300ms.',
    ),
  screenshotShrinkFactor: z
    .number()
    .min(1)
    .optional()
    .describe(
      'Screenshot shrink factor before sending images to AI. Default: 1; high values may reduce recognition quality, especially on mobile.',
    ),
} satisfies Record<ExposedAgentBehaviorInitArgKey, z.ZodTypeAny>;

export function extractAgentBehaviorInitArgs(
  extracted: Partial<AgentBehaviorInitArgs> | undefined,
): AgentBehaviorInitArgs | undefined {
  if (!extracted) {
    return undefined;
  }

  const contexts = Object.fromEntries(
    Object.entries(extracted.contexts ?? {}).filter(
      ([key, value]) => isAgentContextKey(key) && typeof value === 'string',
    ),
  ) as AgentContexts;

  const agentOptions: AgentBehaviorInitArgs = {
    ...(Object.keys(contexts).length > 0 ? { contexts } : {}),
    ...(typeof extracted.aiActContext === 'string'
      ? { aiActContext: extracted.aiActContext }
      : {}),
    ...(typeof extracted.aiActionContext === 'string'
      ? { aiActionContext: extracted.aiActionContext }
      : {}),
    ...(typeof extracted.replanningCycleLimit === 'number'
      ? { replanningCycleLimit: extracted.replanningCycleLimit }
      : {}),
    ...(typeof extracted.waitAfterAction === 'number'
      ? { waitAfterAction: extracted.waitAfterAction }
      : {}),
    ...(typeof extracted.screenshotShrinkFactor === 'number'
      ? { screenshotShrinkFactor: extracted.screenshotShrinkFactor }
      : {}),
  };

  return Object.keys(agentOptions).length > 0 ? agentOptions : undefined;
}

function stableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableJsonValue);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, stableJsonValue(nestedValue)]),
    );
  }

  return value;
}

export function getAgentInitArgsSignature(
  initArgs: object | undefined,
): string | undefined {
  if (!initArgs || Object.keys(initArgs).length === 0) {
    return undefined;
  }

  return JSON.stringify(stableJsonValue(initArgs));
}

export function shouldRebuildAgentForInitArgs(
  currentSignature: string | undefined,
  nextSignature: string | undefined,
): boolean {
  return (
    currentSignature !== nextSignature &&
    (currentSignature !== undefined || nextSignature !== undefined)
  );
}
