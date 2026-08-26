import type { TModelImageInputFormat } from '@midscene/shared/env';
import {
  convertBase64ImageToJpeg,
  convertBase64ImageToWebp,
} from '@midscene/shared/img';
import type { ChatCompletionMessageParam } from 'openai/resources/index';

const supportedBase64ImageUrlPattern =
  /^data:image\/(?:png|jpe?g|webp);base64,/i;
type MessageContentPart = Exclude<
  NonNullable<ChatCompletionMessageParam['content']>,
  string
>[number];

async function convertModelImageUrl(
  url: string,
  imageInputFormat: TModelImageInputFormat,
  conversionCache: Map<string, Promise<string>>,
): Promise<string> {
  if (!supportedBase64ImageUrlPattern.test(url)) {
    return url;
  }

  const cacheKey = `${imageInputFormat}\0${url}`;
  const cachedConversion = conversionCache.get(cacheKey);
  if (cachedConversion) {
    return cachedConversion;
  }

  const conversion =
    imageInputFormat === 'jpeg'
      ? convertBase64ImageToJpeg(url)
      : convertBase64ImageToWebp(url);
  conversionCache.set(cacheKey, conversion);
  return conversion;
}

/**
 * Applies the selected encoding to inline screenshot inputs at the final model
 * request boundary. Remote URLs are intentionally left unchanged.
 */
export async function prepareModelMessagesImageInput(
  messages: ChatCompletionMessageParam[],
  imageInputFormat: TModelImageInputFormat = 'webp',
): Promise<ChatCompletionMessageParam[]> {
  let messagesChanged = false;
  const preparedMessages: ChatCompletionMessageParam[] = [];
  const conversionCache = new Map<string, Promise<string>>();

  // Process sequentially to bound memory when one request contains many
  // full-resolution observation frames.
  for (const message of messages) {
    if (!Array.isArray(message.content)) {
      preparedMessages.push(message);
      continue;
    }

    let contentChanged = false;
    const preparedContent: MessageContentPart[] = [];
    for (const part of message.content) {
      if (part.type !== 'image_url' || !part.image_url?.url) {
        preparedContent.push(part);
        continue;
      }

      const preparedUrl = await convertModelImageUrl(
        part.image_url.url,
        imageInputFormat,
        conversionCache,
      );
      if (preparedUrl === part.image_url.url) {
        preparedContent.push(part);
        continue;
      }

      contentChanged = true;
      preparedContent.push({
        ...part,
        image_url: {
          ...part.image_url,
          url: preparedUrl,
        },
      });
    }

    if (!contentChanged) {
      preparedMessages.push(message);
      continue;
    }

    messagesChanged = true;
    preparedMessages.push({
      ...message,
      content: preparedContent,
    } as ChatCompletionMessageParam);
  }

  return messagesChanged ? preparedMessages : messages;
}
