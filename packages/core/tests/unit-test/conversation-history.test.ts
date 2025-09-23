import { describe, expect, it } from 'vitest';
import { ConversationHistory } from '@/ai-model';

const userMessage = (content: string) => ({
  role: 'user' as const,
  content,
});

const assistantMessage = (content: string) => ({
  role: 'assistant' as const,
  content,
});

describe('ConversationHistory', () => {
  it('limits stored user messages when exceeding maxUserImageMessages', () => {
    const history = new ConversationHistory({ maxUserImageMessages: 2 });

    history.append(userMessage('first'));
    history.append(assistantMessage('ack')); // assistant messages should stay intact
    history.append(userMessage('second'));
    history.append(userMessage('third'));

    const snapshot = history.snapshot();
    expect(snapshot).toEqual([
      assistantMessage('ack'),
      userMessage('second'),
      userMessage('third'),
    ]);
  });

  it('resets state and seeds new messages', () => {
    const history = new ConversationHistory();
    history.append(assistantMessage('greet'));
    history.append(userMessage('question'));

    history.seed([
      assistantMessage('seeded'),
      userMessage('follow-up'),
    ]);

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
});
