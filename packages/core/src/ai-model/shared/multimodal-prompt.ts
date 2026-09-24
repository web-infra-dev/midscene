import {
  type TMultimodalPrompt,
  type TUserPrompt,
  userPromptToMultimodalPrompt,
  userPromptToString,
} from '@/common';
import { prepareImageOutput } from '@/image-output';
import { EncodedImage, preProcessImageUrl } from '@midscene/shared/img';
import type { ChatCompletionUserMessageParam } from 'openai/resources/index';

export interface PreparedReferenceImage {
  name: string;
  url: string;
}

export interface PreparedUserPrompt {
  text: string;
  referenceImages: PreparedReferenceImage[];
}

const prepareReferenceImages = async (
  multimodalPrompt?: TMultimodalPrompt,
): Promise<PreparedReferenceImage[]> => {
  const referenceImages: PreparedReferenceImage[] = [];
  const preparedUrls = new Map<string, string>();
  for (const image of multimodalPrompt?.images ?? []) {
    let preparedUrl = preparedUrls.get(image.url);
    if (preparedUrl === undefined) {
      const url = await preProcessImageUrl(
        image.url,
        !!multimodalPrompt?.convertHttpImage2Base64,
      );
      preparedUrl = /^data:image\/(?:png|jpe?g|webp);base64,/i.test(url)
        ? (await prepareImageOutput(EncodedImage.fromBase64(url))).toBase64()
        : url;
      preparedUrls.set(image.url, preparedUrl);
    }
    referenceImages.push({
      name: image.name,
      url: preparedUrl,
    });
  }
  return referenceImages;
};

export const prepareUserPrompt = async (
  userPrompt: TUserPrompt,
): Promise<PreparedUserPrompt> => ({
  text: userPromptToString(userPrompt),
  referenceImages: await prepareReferenceImages(
    userPromptToMultimodalPrompt(userPrompt),
  ),
});

export const preparedReferenceImagesToChatMessages = (
  referenceImages: PreparedReferenceImage[],
): ChatCompletionUserMessageParam[] => {
  if (referenceImages.length === 0) {
    return [];
  }

  return [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Next, I will provide all the reference images. These reference images are supporting context only, not the current screenshot being evaluated, unless the task explicitly asks for comparison or matching.',
        },
      ],
    },
    ...referenceImages.flatMap((image): ChatCompletionUserMessageParam[] => [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `this is the reference image named '${image.name}'. It is a reference image, not the current screenshot:`,
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: image.url,
              detail: 'high',
            },
          },
        ],
      },
    ]),
  ];
};

export const multimodalPromptToChatMessages = async (
  multimodalPrompt?: TMultimodalPrompt,
): Promise<ChatCompletionUserMessageParam[]> =>
  preparedReferenceImagesToChatMessages(
    await prepareReferenceImages(multimodalPrompt),
  );
