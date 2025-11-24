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

  it('limits image messages in snapshot from back to front', () => {
    const history = new ConversationHistory({ maxUserImageMessages: 2 });

    history.append(userMessageWithImage('first', 'data:image1'));
    history.append(assistantMessage('ack1'));
    history.append(userMessageWithImage('second', 'data:image2'));
    history.append(assistantMessage('ack2'));
    history.append(userMessageWithImage('third', 'data:image3'));

    const snapshot = history.snapshot();
    
    // First image should be omitted (counting from back, it's the 3rd one)
    expect(snapshot[0]).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: 'first' },
        { type: 'text', text: '(omitted due to size limit)' },
      ],
    });

    // Second and third images should be preserved
    expect(snapshot[2]).toEqual(userMessageWithImage('second', 'data:image2'));
    expect(snapshot[4]).toEqual(userMessageWithImage('third', 'data:image3'));
  });

  it('respects maxImageMessages parameter in snapshot options', () => {
    const history = new ConversationHistory({ maxUserImageMessages: 5 });

    history.append(userMessageWithImage('first', 'data:image1'));
    history.append(userMessageWithImage('second', 'data:image2'));
    history.append(userMessageWithImage('third', 'data:image3'));

    // Override with maxImageMessages: 1
    const snapshot = history.snapshot({ maxImageMessages: 1 });

    // Only the last image should be preserved
    expect(snapshot[0].content).toEqual([
      { type: 'text', text: 'first' },
      { type: 'text', text: '(omitted due to size limit)' },
    ]);
    expect(snapshot[1].content).toEqual([
      { type: 'text', text: 'second' },
      { type: 'text', text: '(omitted due to size limit)' },
    ]);
    expect(snapshot[2]).toEqual(userMessageWithImage('third', 'data:image3'));
  });

  it('handles messages with multiple images in content', () => {
    const history = new ConversationHistory({ maxUserImageMessages: 2 });

    const messageWithTwoImages: ChatCompletionMessageParam = {
      role: 'user',
      content: [
        { type: 'text', text: 'Look at these' },
        { type: 'image_url', image_url: { url: 'data:image1' } },
        { type: 'image_url', image_url: { url: 'data:image2' } },
      ],
    };

    history.append(messageWithTwoImages);
    history.append(userMessageWithImage('another', 'data:image3'));

    const snapshot = history.snapshot();

    // From back to front: image3 (1st), image2 (2nd), image1 (3rd - should be omitted)
    expect(snapshot[0].content).toEqual([
      { type: 'text', text: 'Look at these' },
      { type: 'text', text: '(omitted due to size limit)' },
      { type: 'image_url', image_url: { url: 'data:image2' } },
    ]);
    expect(snapshot[1]).toEqual(userMessageWithImage('another', 'data:image3'));
  });
});
