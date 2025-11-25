import { ConversationHistory } from '@/ai-model';
import type { ChatCompletionMessageParam } from 'openai/resources/index';
import { describe, expect, it } from 'vitest';

const userMessage = (content: string) => ({
  role: 'user' as const,
  content,
});

const assistantMessage = (content: string) => ({
  role: 'assistant' as const,
  content,
});

const userMessageWithImage = (text: string, imageUrl: string) => ({
  role: 'user' as const,
  content: [
    { type: 'text' as const, text },
    { type: 'image_url' as const, image_url: { url: imageUrl } },
  ],
});

describe('ConversationHistory', () => {
  it('resets state and seeds new messages', () => {
    const history = new ConversationHistory();
    history.append(assistantMessage('greet'));
    history.append(userMessage('question'));

    history.seed([assistantMessage('seeded'), userMessage('follow-up')]);

    expect(history.snapshot()).toEqual([
      assistantMessage('seeded'),
      userMessage('follow-up'),
    ]);
    expect(history.length).toBe(2);
  });

  it('returns independent snapshot copies', () => {
    const history = new ConversationHistory();
    history.append(assistantMessage('hello'));
    const snapshot = history.snapshot();
    snapshot.push(userMessage('mutated'));

    expect(history.length).toBe(1);
    expect(history.snapshot()).toEqual([assistantMessage('hello')]);
  });

  it('returns image messages without modification', () => {
    const history = new ConversationHistory();

    const messageWithTwoImages: ChatCompletionMessageParam = {
      role: 'user',
      content: [
        { type: 'text', text: 'Look at these' },
        { type: 'image_url', image_url: { url: 'data:image1' } },
        { type: 'image_url', image_url: { url: 'data:image2' } },
      ],
    };

    history.append(userMessageWithImage('first', 'data:image1'));
    history.append(assistantMessage('ack1'));
    history.append(messageWithTwoImages);

    const snapshot = history.snapshot();

    expect(snapshot[0]).toEqual(userMessageWithImage('first', 'data:image1'));
    expect(snapshot[1]).toEqual(assistantMessage('ack1'));
    expect(snapshot[2]).toEqual(messageWithTwoImages);
  });
});
