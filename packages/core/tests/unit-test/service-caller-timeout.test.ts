import type { IModelConfig } from '@midscene/shared/env';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCreate = vi.fn();

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockCreate,
      },
    },
  })),
}));

const baseConfig = (overrides: Partial<IModelConfig> = {}): IModelConfig =>
  ({
    modelName: 'gpt-4o',
    openaiApiKey: 'test-key',
    openaiBaseURL: 'https://api.openai.com/v1',
    modelDescription: 'test model',
    intent: 'default',
    from: 'modelConfig',
    retryCount: 0,
    ...overrides,
  }) as IModelConfig;

describe('service-caller request timeout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves default, custom and disabled timeout values', async () => {
    const { DEFAULT_AI_CALL_TIMEOUT_MS, resolveEffectiveTimeoutMs } =
      await import('@/ai-model/service-caller/request-timeout');

    expect(DEFAULT_AI_CALL_TIMEOUT_MS).toBe(180_000);
    expect(resolveEffectiveTimeoutMs({})).toBe(180_000);
    expect(resolveEffectiveTimeoutMs({ timeout: 12_345 })).toBe(12_345);
    expect(resolveEffectiveTimeoutMs({ timeout: 0 })).toBeNull();
    expect(resolveEffectiveTimeoutMs({ timeout: -1 })).toBeNull();
  });

  it('identifies hard-timeout errors both directly and through cause chains', async () => {
    const { AI_CALL_HARD_TIMEOUT_CODE, isHardTimeoutError } = await import(
      '@/ai-model/service-caller/request-timeout'
    );

    const direct = Object.assign(new Error('timeout'), {
      code: AI_CALL_HARD_TIMEOUT_CODE,
    });
    const wrapped = new Error('wrapped', { cause: direct });

    expect(isHardTimeoutError(direct)).toBe(true);
    expect(isHardTimeoutError(wrapped)).toBe(true);
    expect(isHardTimeoutError(new Error('other'))).toBe(false);
  });

  it('cleans up the injected timer so it does not auto-abort after success', async () => {
    const { buildRequestAbortSignal } = await import(
      '@/ai-model/service-caller/request-timeout'
    );

    const { signal, cleanup } = buildRequestAbortSignal(20);

    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(signal.aborted).toBe(false);
  });

  it('forwards an already-aborted caller signal immediately', async () => {
    const { buildRequestAbortSignal } = await import(
      '@/ai-model/service-caller/request-timeout'
    );

    const controller = new AbortController();
    const reason = new Error('caller already cancelled');
    controller.abort(reason);

    const { signal } = buildRequestAbortSignal(60_000, controller.signal);

    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBe(reason);
  });

  it('aborts a hung request via the injected AbortSignal once timeout elapses', async () => {
    const { callAI } = await import('@/ai-model/service-caller');

    let observedSignal: AbortSignal | undefined;
    mockCreate.mockImplementation((_body, opts) => {
      observedSignal = opts?.signal as AbortSignal | undefined;
      return new Promise((_resolve, reject) => {
        observedSignal?.addEventListener('abort', () => {
          reject(observedSignal?.reason ?? new Error('aborted'));
        });
      });
    });

    const promise = callAI(
      [{ role: 'user', content: 'hello' }],
      baseConfig({ timeout: 50 }),
    );

    await expect(promise).rejects.toThrow(/hard timeout after 50ms/);
    expect(observedSignal).toBeDefined();
    expect(observedSignal?.aborted).toBe(true);
  });

  it('tags the timeout error with AI_CALL_HARD_TIMEOUT so callers can branch on it', async () => {
    const { callAI } = await import('@/ai-model/service-caller');
    const { AI_CALL_HARD_TIMEOUT_CODE, isHardTimeoutError } = await import(
      '@/ai-model/service-caller/request-timeout'
    );

    expect(AI_CALL_HARD_TIMEOUT_CODE).toBe('AI_CALL_HARD_TIMEOUT');

    mockCreate.mockImplementation((_body, opts) => {
      const signal = opts?.signal as AbortSignal | undefined;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(signal.reason));
      });
    });

    try {
      await callAI(
        [{ role: 'user', content: 'hello' }],
        baseConfig({ timeout: 30 }),
      );
      throw new Error('should have timed out');
    } catch (err) {
      expect(isHardTimeoutError(err)).toBe(true);
    }
  });

  it('uses the 180s default timeout when none is configured', async () => {
    const { callAI } = await import('@/ai-model/service-caller');
    const { DEFAULT_AI_CALL_TIMEOUT_MS } = await import(
      '@/ai-model/service-caller/request-timeout'
    );

    expect(DEFAULT_AI_CALL_TIMEOUT_MS).toBe(180_000);

    mockCreate.mockResolvedValue({
      choices: [{ message: { content: 'ok' } }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      _request_id: 'req_default_timeout',
    });

    await callAI([{ role: 'user', content: 'hello' }], baseConfig());

    const OpenAI = (await import('openai')).default as unknown as ReturnType<
      typeof vi.fn
    >;
    const lastCallOptions = OpenAI.mock.calls.at(-1)?.[0];
    expect(lastCallOptions?.timeout).toBe(180_000);
    expect(lastCallOptions?.maxRetries).toBe(0);
  });

  it('retries after a hard timeout and returns the next successful response', async () => {
    const { callAI } = await import('@/ai-model/service-caller');

    mockCreate
      .mockImplementationOnce((_body, opts) => {
        const signal = opts?.signal as AbortSignal | undefined;
        return new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => {
            reject(signal.reason ?? new Error('aborted'));
          });
        });
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'recovered' } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        _request_id: 'req_retry_ok',
      });

    const result = await callAI(
      [{ role: 'user', content: 'hello' }],
      baseConfig({ timeout: 30, retryCount: 1, retryInterval: 0 }),
    );

    expect(result.content).toBe('recovered');
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('disables the hard timeout when modelConfig.timeout is 0', async () => {
    const { callAI } = await import('@/ai-model/service-caller');
    const { resolveEffectiveTimeoutMs } = await import(
      '@/ai-model/service-caller/request-timeout'
    );

    expect(resolveEffectiveTimeoutMs({ timeout: 0 })).toBeNull();

    mockCreate.mockResolvedValue({
      choices: [{ message: { content: 'ok' } }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      _request_id: 'req_no_timeout',
    });

    await callAI(
      [{ role: 'user', content: 'hello' }],
      baseConfig({ timeout: 0 }),
    );

    const OpenAI = (await import('openai')).default as unknown as ReturnType<
      typeof vi.fn
    >;
    const lastCallOptions = OpenAI.mock.calls.at(-1)?.[0];
    // When timeout is disabled we should NOT forward a timeout to the SDK.
    expect(lastCallOptions?.timeout).toBeUndefined();

    // And the signal we injected should not auto-abort.
    const lastCreateOpts = mockCreate.mock.calls.at(-1)?.[1];
    const signal = lastCreateOpts?.signal as AbortSignal;
    expect(signal.aborted).toBe(false);
  });

  it('honours the caller abortSignal even before the timeout fires', async () => {
    const { callAI } = await import('@/ai-model/service-caller');

    mockCreate.mockImplementation((_body, opts) => {
      const signal = opts?.signal as AbortSignal | undefined;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
          reject(signal.reason ?? new Error('aborted'));
        });
      });
    });

    const controller = new AbortController();
    const promise = callAI(
      [{ role: 'user', content: 'hello' }],
      baseConfig({ timeout: 60_000 }),
      { abortSignal: controller.signal },
    );

    setTimeout(() => controller.abort(new Error('user cancelled')), 10);

    await expect(promise).rejects.toThrow(/user cancelled/);
  });
});
