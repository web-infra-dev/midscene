import {
  callAiAndParseWithRetry,
  withSemanticRetryFeedback,
} from '@/ai-model/service-caller/semantic-retry';
import { describe, expect, it } from '@rstest/core';

describe('callAiAndParseWithRetry', () => {
  it('increments the semantic retry attempt after parsing failures', async () => {
    const attempts: number[] = [];
    const previousErrors: Array<string | undefined> = [];

    const result = await callAiAndParseWithRetry({
      callAi: async (retryAttempt, previousParseError) => {
        attempts.push(retryAttempt);
        previousErrors.push(
          previousParseError instanceof Error
            ? previousParseError.message
            : undefined,
        );
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
    expect(previousErrors).toEqual([undefined, 'invalid response']);
  });

  it('adds the complete validation error message to retry feedback', () => {
    const messages = withSemanticRetryFeedback(
      [{ role: 'user', content: 'original request' }],
      new Error(
        'failed to parse LLM response into JSON. Response -\n{"untrusted":"raw response"}',
      ),
    );

    expect(messages).toEqual([
      { role: 'user', content: 'original request' },
      {
        role: 'user',
        content:
          'The previous response was invalid:\nfailed to parse LLM response into JSON. Response -\n{"untrusted":"raw response"}\n\nPlease avoid the validation error above in this response.',
      },
    ]);
  });
});
