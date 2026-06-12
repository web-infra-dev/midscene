import { z } from 'zod';

export interface AgentBehaviorInitArgs {
  aiActContext?: string;
  aiActionContext?: string;
  replanningCycleLimit?: number;
  waitAfterAction?: number;
  screenshotShrinkFactor?: number;
}

export const agentBehaviorInitArgShape = {
  aiActContext: z
    .string()
    .optional()
    .describe(
      'Background knowledge passed to aiAct. Default: no extra context.',
    ),
  aiActionContext: z
    .string()
    .optional()
    .describe('Deprecated alias for aiActContext. Default: no extra context.'),
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
} satisfies Record<keyof AgentBehaviorInitArgs, z.ZodTypeAny>;

export function extractAgentBehaviorInitArgs(
  extracted: Partial<AgentBehaviorInitArgs> | undefined,
): AgentBehaviorInitArgs | undefined {
  if (!extracted) {
    return undefined;
  }

  const agentOptions: AgentBehaviorInitArgs = {
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
