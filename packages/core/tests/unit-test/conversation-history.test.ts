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

const ignoredImagePlaceholder = {
  type: 'text' as const,
  text: '(image ignored due to size optimization)',
};

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

  it('clears pending feedback message only when set', () => {
    const history = new ConversationHistory();

    expect(history.pendingFeedbackMessage).toBe('');

    history.resetPendingFeedbackMessageIfExists();
    expect(history.pendingFeedbackMessage).toBe('');

    history.pendingFeedbackMessage = 'Need a screenshot';
    history.resetPendingFeedbackMessageIfExists();
    expect(history.pendingFeedbackMessage).toBe('');

    history.pendingFeedbackMessage = '';
    history.resetPendingFeedbackMessageIfExists();
    expect(history.pendingFeedbackMessage).toBe('');
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

  it('replaces older images with text when exceeding the maxImages limit', () => {
    const history = new ConversationHistory();

    const messageWithTwoImages: ChatCompletionMessageParam = {
      role: 'user',
      content: [
        { type: 'text', text: 'More images' },
        { type: 'image_url', image_url: { url: 'data:image2' } },
        { type: 'image_url', image_url: { url: 'data:image3' } },
      ],
    };

    history.append(userMessageWithImage('first', 'data:image1'));
    history.append(assistantMessage('ack'));
    history.append(messageWithTwoImages);

    const snapshotWithLimit = history.snapshot(1);

    expect(snapshotWithLimit[0]).toEqual({
      role: 'user',
      content: [{ type: 'text', text: 'first' }, ignoredImagePlaceholder],
    });
    expect(snapshotWithLimit[2]).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: 'More images' },
        { type: 'image_url', image_url: { url: 'data:image2' } },
        ignoredImagePlaceholder,
      ],
    });

    // Original history remains unchanged
    const snapshotWithoutLimit = history.snapshot();
    expect(snapshotWithoutLimit[0]).toEqual(
      userMessageWithImage('first', 'data:image1'),
    );
    expect(snapshotWithoutLimit[2]).toEqual(messageWithTwoImages);
  });
});
