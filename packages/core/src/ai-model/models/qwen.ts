import type { TModelFamily } from '@midscene/shared/env';
import {
  type Bbox,
  type LocateResultValue,
  unwrapBboxLikeInput,
} from '../shared/model-locate-result';
import type {
  ChatCompletionParamsResult,
  ModelAdapterDefinition,
  ModelCallContext,
} from './types';

const defaultBboxSize = 20;

function topLeftPointToBbox(x: number, y: number): Bbox {
  return [
    Math.round(x),
    Math.round(y),
    Math.round(x + defaultBboxSize),
    Math.round(y + defaultBboxSize),
  ];
}

function resolveQwen25LocateResult(input: unknown): LocateResultValue {
  const bbox = unwrapBboxLikeInput(input as any) as number[];
  if (bbox.length < 2) {
    const msg = `invalid bbox data for qwen-vl mode: ${JSON.stringify(bbox)} `;
    throw new Error(msg);
  }

  if (typeof bbox[2] === 'number' && typeof bbox[3] === 'number') {
    return {
      type: 'bbox',
      coordinates: [bbox[0], bbox[1], bbox[2], bbox[3]],
    };
  }

  return { type: 'point', coordinates: [bbox[0], bbox[1]] };
}

function normalizeQwen25ResultToPixelBbox(result: LocateResultValue): Bbox {
  if (result.type === 'bbox') {
    return [
      Math.round(result.coordinates[0]),
      Math.round(result.coordinates[1]),
      Math.round(result.coordinates[2]),
      Math.round(result.coordinates[3]),
    ];
  }

  return topLeftPointToBbox(result.coordinates[0], result.coordinates[1]);
}

const buildQwenChatCompletionParams = ({
  reasoningEnabled,
  reasoningBudget,
}: ModelCallContext): ChatCompletionParamsResult => {
  const debugMessages: string[] = [];
  const config: Record<string, unknown> = {};

  if (reasoningEnabled !== undefined) {
    config.enable_thinking = reasoningEnabled;
    debugMessages.push(`enable_thinking=${reasoningEnabled}`);
  }
  if (reasoningBudget !== undefined) {
    config.thinking_budget = reasoningBudget;
    debugMessages.push(`thinking_budget=${reasoningBudget}`);
  }

  return { config, debugMessages };
};

const qwen3XAdapter: ModelAdapterDefinition = {
  chatCompletion: {
    buildChatCompletionParams: buildQwenChatCompletionParams,
  },
  locate: {
    resultAdapter: {
      format: 'bbox-normalized-0-1000-xyxy',
    },
  },
};

export const qwenAdapters = {
  'qwen2.5-vl': {
    chatCompletion: {
      buildChatCompletionParams: () => ({
        config: {
          vl_high_resolution_images: true,
        },
      }),
    },
    imagePreprocess: {
      padBlockSize: 28,
    },
    locate: {
      resultAdapter: {
        format: 'bbox-actual-pixel-xyxy',
        resolve: resolveQwen25LocateResult,
        normalize: normalizeQwen25ResultToPixelBbox,
      },
    },
  },
  'qwen3-vl': {
    chatCompletion: {
      buildChatCompletionParams: buildQwenChatCompletionParams,
    },
    locate: {
      resultAdapter: {
        format: 'bbox-normalized-0-1000-xyxy',
      },
    },
  },
  'qwen3.5': qwen3XAdapter,
  'qwen3.6': qwen3XAdapter,
} satisfies Pick<
  Record<TModelFamily, ModelAdapterDefinition>,
  'qwen2.5-vl' | 'qwen3-vl' | 'qwen3.5' | 'qwen3.6'
>;
