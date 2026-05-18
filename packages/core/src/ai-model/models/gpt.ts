import type { TModelFamily } from '@midscene/shared/env';
import {
  type LocateResultValue,
  unwrapBboxLikeInput,
} from '../shared/model-locate-result';
import type {
  ImageDetail,
  ModelAdapterDefinition,
  ModelCallContext,
} from './types';

const originalImageDetailForDefaultIntent = (
  input: ModelCallContext,
): ImageDetail | undefined =>
  input.intent === 'default' ? 'original' : undefined;

function resolveGpt5LocateResult(input: unknown): LocateResultValue {
  const bbox = unwrapBboxLikeInput(input as any);
  if (
    !Array.isArray(bbox) ||
    bbox.length !== 4 ||
    !bbox.every((value) => typeof value === 'number' && Number.isFinite(value))
  ) {
    const msg = `invalid bbox data for gpt-5 mode: ${JSON.stringify(input)} `;
    throw new Error(msg);
  }

  const numericBbox = bbox as number[];
  return {
    type: 'bbox',
    coordinates: [
      numericBbox[0],
      numericBbox[1],
      numericBbox[2],
      numericBbox[3],
    ],
  };
}

const buildGpt5ChatCompletionParams = ({
  reasoningEnabled,
  reasoningEffort,
  reasoningBudget,
}: ModelCallContext) => {
  if (
    reasoningEnabled === undefined &&
    !reasoningEffort &&
    reasoningBudget === undefined
  ) {
    return {
      config: {},
      lockedParams: ['temperature'],
    };
  }

  return {
    config: { reasoning: undefined },
    debugMessages: ['reasoning config is ignored for gpt-5'],
    lockedParams: ['temperature'],
  };
};

export const gptAdapters = {
  'gpt-5': {
    chatCompletion: {
      buildChatCompletionParams: buildGpt5ChatCompletionParams,
      resolveImageDetail: originalImageDetailForDefaultIntent,
    },
    locate: {
      resultAdapter: {
        format: 'bbox-actual-pixel-xyxy',
        resolve: resolveGpt5LocateResult,
      },
    },
  },
} satisfies Pick<Record<TModelFamily, ModelAdapterDefinition>, 'gpt-5'>;
