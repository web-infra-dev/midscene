import type { ChatCompletionMessageParam } from 'openai/resources/index';
import { describe, expect, it } from 'vitest';
import { prepareModelMessagesImageInput } from '../../src/ai-model/service-caller/model-image-input';

const pngDataUrl =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAIAAABxZ0isAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGMQqbiDFTEMpAQAorNDgTX/VEoAAAAASUVORK5CYII=';
const webpDataUrl =
  'data:image/webp;base64,UklGRjQAAABXRUJQVlA4ICgAAACQAQCdASoCAAMAAMASJQBOl0AAjNAA/v4icv1difCfoP7mxzi2QwAA';

function imageMessage(url: string): ChatCompletionMessageParam[] {
  return [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'inspect this screenshot' },
        { type: 'image_url', image_url: { url, detail: 'high' } },
      ],
    },
  ];
}

function preparedImageUrl(messages: ChatCompletionMessageParam[]): string {
  const content = messages[0].content;
  if (!Array.isArray(content)) {
    throw new Error('expected multimodal content');
  }
  const imagePart = content.find((part) => part.type === 'image_url');
  if (!imagePart || imagePart.type !== 'image_url') {
    throw new Error('expected image content');
  }
  return imagePart.image_url.url;
}

describe('prepareModelMessagesImageInput', () => {
  it('normalizes inline screenshots to WebP by default', async () => {
    const messages = imageMessage(pngDataUrl);
    const prepared = await prepareModelMessagesImageInput(messages);

    expect(preparedImageUrl(prepared)).toMatch(/^data:image\/webp;base64,/);
    expect(prepared).not.toBe(messages);
    expect(preparedImageUrl(messages)).toBe(pngDataUrl);
  });

  it('provides a JPEG fallback without changing the original messages', async () => {
    const messages = imageMessage(webpDataUrl);
    const prepared = await prepareModelMessagesImageInput(messages, 'jpeg');

    expect(preparedImageUrl(prepared)).toMatch(/^data:image\/jpeg;base64,/);
    expect(preparedImageUrl(messages)).toBe(webpDataUrl);
  });

  it('leaves remote image URLs and message identity unchanged', async () => {
    const messages = imageMessage('https://example.com/screenshot.png');

    await expect(
      prepareModelMessagesImageInput(messages, 'jpeg'),
    ).resolves.toBe(messages);
  });
});
