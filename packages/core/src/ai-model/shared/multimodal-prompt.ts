import type { TMultimodalPrompt } from '@/common';
import { preProcessImageUrl } from '@midscene/shared/img';
import type { ChatCompletionUserMessageParam } from 'openai/resources/index';

export const multimodalPromptToChatMessages = async (
  multimodalPrompt?: TMultimodalPrompt,
): Promise<ChatCompletionUserMessageParam[]> => {
  const msgs: ChatCompletionUserMessageParam[] = [];
  if (multimodalPrompt?.images?.length) {
    msgs.push({
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Next, I will provide all the reference images. These reference images are supporting context only, not the current screenshot being evaluated, unless the task explicitly asks for comparison or matching.',
        },
      ],
    });

    for (const item of multimodalPrompt.images) {
      const imagePayload = await preProcessImageUrl(
        item.url,
        !!multimodalPrompt.convertHttpImage2Base64,
      );

      msgs.push({
        role: 'user',
        content: [
          {
            type: 'text',
            text: `this is the reference image named '${item.name}'. It is a reference image, not the current screenshot:`,
          },
        ],
      });

      msgs.push({
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: imagePayload,
              detail: 'high',
            },
          },
        ],
      });
    }
  }
  return msgs;
};
