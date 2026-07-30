import { callAiAndParseWithRetry } from '@/ai-model/service-caller/semantic-retry';
import { describe, expect, it } from 'vitest';

describe('callAiAndParseWithRetry', () => {
  it('increments the semantic retry attempt after parsing failures', async () => {
    const attempts: number[] = [];

    const result = await callAiAndParseWithRetry({
      callAi: async (retryAttempt) => {
        attempts.push(retryAttempt);
        return retryAttempt;
      },
      parseResponse: (response) => {
        if (response === 0) {
          throw new Error('invalid response');
        }
        return response;
      },
      toParseError: (error) =>
        error instanceof Error ? error : new Error(String(error)),
      parseRetryTimes: 1,
    });

    expect(result).toBe(1);
    expect(attempts).toEqual([0, 1]);
  });
});
