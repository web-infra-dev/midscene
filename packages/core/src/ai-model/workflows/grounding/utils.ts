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
