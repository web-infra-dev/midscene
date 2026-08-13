import type {
  ChatCompletionSystemMessageParam,
  ChatCompletionUserMessageParam,
} from 'openai/resources/index';
import type { ModelRuntime } from '../../models';

export type GroundingAIArgs = [
  ChatCompletionSystemMessageParam,
  ...ChatCompletionUserMessageParam[],
];

export function formatLocateModelContext(modelRuntime: ModelRuntime): string {
  const { modelFamily, modelName } = modelRuntime.config;
  return `modelName=${modelName ?? 'unset'} modelFamily=${modelFamily ?? 'unset'}`;
}

export function hasLocateResult(input: unknown, resultKey: string) {
  if (!input || typeof input !== 'object') {
    return false;
  }

  const record = input as Record<string, unknown>;
  const locateResult = record[resultKey];
  return Array.isArray(locateResult)
    ? locateResult.length > 0
    : locateResult !== undefined;
}
