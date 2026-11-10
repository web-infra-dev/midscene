import { type TUserPrompt, userPromptToMultimodalPrompt } from '@/common';
import {
  type ImagePreprocessPolicy,
  type PreparedModelImage,
  prepareModelImage,
} from '../../model-adapter/image-preprocess';
import {
  type LocateMessages,
  type LocatePromptOrder,
  buildLocateMessages,
} from '../../model-adapter/locate-prompt-order';
import type { ModelRuntime } from '../../models';
import { multimodalPromptToMessages } from '../../shared/multimodal-prompt';

export async function prepareLocateModelInput({
  locateImage,
  targetDescription,
  systemPrompt,
  userPrompt,
  imagePreprocess,
  promptOrder,
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
  promptOrder: LocatePromptOrder;
}): Promise<{
  messages: LocateMessages;
  preparedImage: PreparedModelImage;
}> {
  const preparedImage = await prepareModelImage({
    imageBase64: locateImage.imageBase64,
    width: locateImage.width,
    height: locateImage.height,
    policy: imagePreprocess,
  });
  const referenceImageMessages = await multimodalPromptToMessages(
    userPromptToMultimodalPrompt(targetDescription),
  );
  return {
    preparedImage,
    messages: buildLocateMessages(promptOrder, {
      instructions: systemPrompt,
      screenshot: preparedImage.imageBase64,
      task: userPrompt,
      references: referenceImageMessages,
    }),
  };
}

export function formatLocateModelContext(modelRuntime: ModelRuntime): string {
  const { modelFamily, modelName } = modelRuntime.config;
  return `modelName=${modelName ?? 'unset'} modelFamily=${modelFamily ?? 'unset'}`;
}
