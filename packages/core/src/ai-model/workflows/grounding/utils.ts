import type {
  ChatCompletionContentPart,
  ChatCompletionSystemMessageParam,
  ChatCompletionUserMessageParam,
} from 'openai/resources/index';
import type { LocateUserMessageContentOrder } from '../../model-adapter/types';
import type { ModelRuntime } from '../../models';

export type GroundingAIArgs = [
  ChatCompletionSystemMessageParam,
  ...ChatCompletionUserMessageParam[],
];

export function buildLocateMessages({
  systemPrompt,
  imagePayload,
  userPrompt,
  userMessageContentOrder,
  additionalMessages = [],
}: {
  systemPrompt: string;
  imagePayload: string;
  userPrompt: string;
  userMessageContentOrder: LocateUserMessageContentOrder;
  additionalMessages?: ChatCompletionUserMessageParam[];
}): GroundingAIArgs {
  const imageContent: ChatCompletionContentPart = {
    type: 'image_url',
    image_url: {
      url: imagePayload,
      detail: 'high',
    },
  };
  const promptContent: ChatCompletionContentPart = {
    type: 'text',
    text: userPrompt,
  };

  return [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content:
        userMessageContentOrder === 'prompt-first'
          ? [promptContent, imageContent]
          : [imageContent, promptContent],
    },
    ...additionalMessages,
  ];
}

export function formatLocateModelContext(modelRuntime: ModelRuntime): string {
  const { modelFamily, modelName } = modelRuntime.config;
  return `modelName=${modelName ?? 'unset'} modelFamily=${modelFamily ?? 'unset'}`;
}
