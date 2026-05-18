import { preProcessImageUrl } from '@midscene/shared/img';
import type {
  ChatCompletionSystemMessageParam,
  ChatCompletionUserMessageParam,
} from 'openai/resources/index';
import type { TMultimodalPrompt, TUserPrompt } from '../../../common';

export type InspectAIArgs = [
  ChatCompletionSystemMessageParam,
  ...ChatCompletionUserMessageParam[],
];

export const extraTextFromUserPrompt = (prompt: TUserPrompt): string => {
  if (typeof prompt === 'string') {
    return prompt;
  }
  return prompt.prompt;
};

export const promptsToChatParam = async (
  multimodalPrompt: TMultimodalPrompt,
): Promise<ChatCompletionUserMessageParam[]> => {
  const msgs: ChatCompletionUserMessageParam[] = [];
  if (multimodalPrompt?.images?.length) {
    msgs.push({
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Next, I will provide all the reference images.',
        },
      ],
    });

    for (const item of multimodalPrompt.images) {
      const base64 = await preProcessImageUrl(
        item.url,
        !!multimodalPrompt.convertHttpImage2Base64,
      );

      msgs.push({
        role: 'user',
        content: [
          {
            type: 'text',
            text: `this is the reference image named '${item.name}':`,
          },
        ],
      });

      msgs.push({
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: base64,
              detail: 'high',
            },
          },
        ],
      });
    }
  }
  return msgs;
};
