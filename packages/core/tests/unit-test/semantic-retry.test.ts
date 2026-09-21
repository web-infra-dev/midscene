import {
  callAiAndParseWithRetry,
  withSemanticRetryFeedback,
} from '@/ai-model/service-caller/semantic-retry';
import { describe, expect, it, rs } from '@rstest/core';

describe('callAiAndParseWithRetry', () => {
  it('preserves cancellation when asynchronous parsing succeeds after cancellation', async () => {
    const controller = new AbortController();
    const reason = new Error('cancelled during parsing');
    const callAi = rs.fn().mockResolvedValue('response');
    const toParseError = rs.fn(() => new Error('parse failed'));

    await expect(
      callAiAndParseWithRetry({
        callAi,
        parseResponse: async () => {
          await Promise.resolve();
          controller.abort(reason);
          return 'parsed';
        },
        toParseError,
        parseRetryTimes: 1,
        abortSignal: controller.signal,
      }),
    ).rejects.toBe(reason);

    expect(callAi).toHaveBeenCalledTimes(1);
    expect(toParseError).not.toHaveBeenCalled();
  });

  it('preserves cancellation when parsing fails after the signal is aborted', async () => {
    const controller = new AbortController();
    const reason = new Error('cancelled during parsing');
    const callAi = rs.fn().mockResolvedValue('response');
    const toParseError = rs.fn(() => new Error('parse failed'));

    await expect(
      callAiAndParseWithRetry({
        callAi,
        parseResponse: async () => {
          controller.abort(reason);
          throw new Error('invalid response');
        },
        toParseError,
        parseRetryTimes: 1,
        abortSignal: controller.signal,
      }),
    ).rejects.toBe(reason);

    expect(callAi).toHaveBeenCalledTimes(1);
    expect(toParseError).not.toHaveBeenCalled();
  });

  it('preserves cancellation from onParseRetry with no retry delay', async () => {
    const controller = new AbortController();
    const reason = new Error('cancelled by caller');
    const callAi = rs.fn().mockResolvedValue('invalid');
    const toParseError = rs.fn(() => new Error('parse failed'));

    await expect(
      callAiAndParseWithRetry({
        callAi,
        parseResponse: () => {
          throw new Error('invalid response');
        },
        toParseError,
        parseRetryTimes: 1,
        parseRetryInterval: 0,
        abortSignal: controller.signal,
        onParseRetry: () => controller.abort(reason),
      }),
    ).rejects.toBe(reason);

    expect(callAi).toHaveBeenCalledTimes(1);
    expect(toParseError).not.toHaveBeenCalled();
  });

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
