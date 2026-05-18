import type { TModelFamily } from '@midscene/shared/env';
import { getModelAdapter } from '../models';

export function resolveReasoningConfig({
  reasoningEnabled,
  reasoningEffort,
  reasoningBudget,
  modelFamily,
}: {
  reasoningEnabled?: boolean;
  reasoningEffort?: string;
  reasoningBudget?: number;
  modelFamily?: TModelFamily;
}): {
  config: Record<string, unknown>;
  debugMessage?: string;
  warningMessage?: string;
} {
  const hasReasoningParams = !(
    reasoningEnabled === undefined &&
    !reasoningEffort &&
    reasoningBudget === undefined
  );

  if (!hasReasoningParams && !modelFamily) {
    return { config: {} };
  }

  if (hasReasoningParams && !modelFamily) {
    return {
      config: {},
      debugMessage: 'reasoning config ignored: no model_family configured',
      warningMessage:
        'Reasoning config is set but no model_family is configured. Set MIDSCENE_MODEL_FAMILY to enable reasoning config pass-through.',
    };
  }

  const result = getModelAdapter(
    modelFamily,
  ).chatCompletion.buildChatCompletionParams({
    reasoningEnabled,
    reasoningEffort,
    reasoningBudget,
  });

  return {
    config: result.config,
    debugMessage: result.debugMessages?.length
      ? `reasoning config for ${modelFamily}: ${result.debugMessages.join(', ')}`
      : undefined,
  };
}
