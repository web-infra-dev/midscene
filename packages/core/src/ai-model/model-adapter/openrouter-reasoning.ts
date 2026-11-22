import type { ReasoningInput } from './types';

type OpenRouterReasoningControlMethod =
  | { type: 'enabled' }
  | {
      type: 'effort';
      disabledEffort: string;
      defaultEnabledEffort: string;
    };

interface OpenRouterReasoning {
  enabled?: boolean;
  effort?: string;
  max_tokens?: number;
}

interface OpenRouterReasoningParams {
  reasoning?: OpenRouterReasoning;
}

// OpenRouter exposes unified effort and budget parameters. When reasoning is
// explicitly enabled, forward both whenever configured, without model-specific
// validation. Whether the selected model accepts and honors them depends on
// the actual provider and model.
// https://openrouter.ai/docs/guides/best-practices/reasoning-tokens
export function buildOpenRouterReasoningParams(
  {
    reasoningEnabled = false,
    reasoningEffort,
    reasoningBudget,
  }: ReasoningInput,
  controlMethod: OpenRouterReasoningControlMethod = { type: 'enabled' },
): OpenRouterReasoningParams {
  if (reasoningEnabled === 'default') {
    return {};
  }

  const reasoning: OpenRouterReasoning = {};
  if (controlMethod.type === 'effort') {
    reasoning.effort =
      reasoningEnabled === true
        ? (reasoningEffort ?? controlMethod.defaultEnabledEffort)
        : controlMethod.disabledEffort;
  } else {
    reasoning.enabled = reasoningEnabled;
    if (reasoningEnabled === true && reasoningEffort !== undefined) {
      reasoning.effort = reasoningEffort;
    }
  }

  // Budget forwarding is independent of the reasoning control method.
  // When reasoning is explicitly enabled, forward any configured budget
  // as max_tokens regardless of how reasoning is disabled.
  if (reasoningEnabled === true && reasoningBudget !== undefined) {
    reasoning.max_tokens = reasoningBudget;
  }

  return { reasoning };
}
