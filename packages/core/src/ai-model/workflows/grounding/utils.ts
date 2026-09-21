import { type TUserPrompt, userPromptToMultimodalPrompt } from '@/common';
import type {
  ChatCompletionContentPart,
  ChatCompletionSystemMessageParam,
  ChatCompletionUserMessageParam,
} from 'openai/resources/index';
import {
  type ImagePreprocessPolicy,
  type PreparedModelImage,
  prepareModelImage,
} from '../../model-adapter/image-preprocess';
import type { LocateUserMessageContentOrder } from '../../model-adapter/types';
import type { ModelRuntime } from '../../models';
import { multimodalPromptToChatMessages } from '../../shared/multimodal-prompt';

export type GroundingAIArgs = [
  ChatCompletionSystemMessageParam,
  ...ChatCompletionUserMessageParam[],
];

export async function prepareLocateModelInput({
  locateImage,
  targetDescription,
  systemPrompt,
  userPrompt,
  imagePreprocess,
  userMessageContentOrder,
}: {
  locateImage: {
    imageBase64: string;
    width: number;
    height: number;
  };
  targetDescription: TUserPrompt;
  systemPrompt: string;
  userPrompt: string;
  imagePreprocess: ImagePreprocessPolicy;
  userMessageContentOrder: LocateUserMessageContentOrder;
}): Promise<{
  messages: GroundingAIArgs;
  preparedImage: PreparedModelImage;
}> {
  const preparedImage = await prepareModelImage({
    imageBase64: locateImage.imageBase64,
    width: locateImage.width,
    height: locateImage.height,
    policy: imagePreprocess,
  });
  const referenceImageMessages = await multimodalPromptToChatMessages(
    userPromptToMultimodalPrompt(targetDescription),
  );
  const imageContent: ChatCompletionContentPart = {
    type: 'image_url',
    image_url: {
      url: preparedImage.imageBase64,
      detail: 'high',
    },
  };
  const promptContent: ChatCompletionContentPart = {
    type: 'text',
    text: userPrompt,
  };

  return {
    preparedImage,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content:
          userMessageContentOrder === 'prompt-first'
            ? [promptContent, imageContent]
            : [imageContent, promptContent],
      },
      ...referenceImageMessages,
    ],
  };
}

export function formatLocateModelContext(modelRuntime: ModelRuntime): string {
  const { modelFamily, modelName } = modelRuntime.config;
  return `modelName=${modelName ?? 'unset'} modelFamily=${modelFamily ?? 'unset'}`;
}
