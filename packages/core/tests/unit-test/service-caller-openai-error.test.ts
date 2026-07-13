import type { IModelConfig } from '@midscene/shared/env';
import { beforeEach, describe, expect, it, rs } from '@rstest/core';

const mockCreate = rs.fn();
const mockOpenAIConstructor = rs.fn().mockImplementation(() => ({
  chat: {
    completions: {
      create: mockCreate,
    },
  },
}));

rs.mock('openai', () => ({
  default: mockOpenAIConstructor,
}));

const baseConfig = (overrides: Partial<IModelConfig> = {}): IModelConfig =>
  ({
    modelName: 'gpt-4o',
    openaiApiKey: 'test-key',
    openaiBaseURL: 'https://api.openai.com/v1',
    modelDescription: 'test model',
    intent: 'default',
    slot: 'default',
    retryCount: 0,
    ...overrides,
  }) as IModelConfig;

describe('service-caller OpenAI error handling', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    rs.clearAllMocks();
    globalThis.fetch = originalFetch;
  });

  it('records non-2xx raw response body without changing the response', async () => {
    const { wrapOpenAICompatibleFetch } = await import(
      '@/ai-model/service-caller/openai-error'
    );
    const context = {};
    const responseBody = JSON.stringify({
      detail: 'model does not exist',
      trace_id: 'trace_123',
    });
    const response = new Response(responseBody, {
      status: 422,
      statusText: 'Unprocessable Entity',
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'req_123',
      },
    });
    globalThis.fetch = rs.fn().mockResolvedValue(response);

    const wrappedResponse = await wrapOpenAICompatibleFetch(context)(
      'https://example.com/v1/chat/completions',
      { method: 'POST' },
    );

    expect(wrappedResponse).toBe(response);
    await expect(wrappedResponse.text()).resolves.toBe(responseBody);
    expect(context).toEqual({
      rawResponseBodies: [{ attempt: 1, body: responseBody }],
    });
  });

  it('does not record successful response bodies', async () => {
    const { wrapOpenAICompatibleFetch } = await import(
      '@/ai-model/service-caller/openai-error'
    );
    const context = {};
    const response = new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
    globalThis.fetch = rs.fn().mockResolvedValue(response);

    await expect(
      wrapOpenAICompatibleFetch(context)('https://example.com'),
    ).resolves.toBe(response);
    expect(context).toEqual({});
  });

  it('keeps raw response bodies from multiple failed requests', async () => {
    const { wrapOpenAICompatibleFetch } = await import(
      '@/ai-model/service-caller/openai-error'
    );
    const context = {};
    globalThis.fetch = rs
      .fn()
      .mockResolvedValueOnce(new Response('first body', { status: 500 }))
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce(new Response('third body', { status: 502 }));
    const wrappedFetch = wrapOpenAICompatibleFetch(context);

    await expect(wrappedFetch('https://example.com')).resolves.toBeInstanceOf(
      Response,
    );
    await expect(wrappedFetch('https://example.com')).rejects.toThrow(
      'network error',
    );
    await expect(wrappedFetch('https://example.com')).resolves.toBeInstanceOf(
      Response,
    );

    expect(context).toEqual({
      rawResponseBodies: [
        { attempt: 1, body: 'first body' },
        { attempt: 3, body: 'third body' },
      ],
      fetchErrors: [{ attempt: 2, error: 'Error: network error' }],
    });
  });

  it('records and reports original fetch errors before rethrowing them', async () => {
    const { formatOpenAIAPIErrorDetails, wrapOpenAICompatibleFetch } =
      await import('@/ai-model/service-caller/openai-error');
    const context = {};
    const cause = Object.assign(
      new Error(
        'Connect Timeout Error (attempted addresses: 2605:340::1:443, timeout: 10000ms)',
      ),
      {
        name: 'ConnectTimeoutError',
        code: 'UND_ERR_CONNECT_TIMEOUT',
      },
    );
    const fetchError = Object.assign(new TypeError('fetch failed'), {
      cause,
    });
    globalThis.fetch = rs.fn().mockRejectedValue(fetchError);

    await expect(
      wrapOpenAICompatibleFetch(context)('https://example.com'),
    ).rejects.toBe(fetchError);

    expect(context).toEqual({
      fetchErrors: [
        {
          attempt: 1,
          error:
            'TypeError: fetch failed\nCause: ConnectTimeoutError [UND_ERR_CONNECT_TIMEOUT]: Connect Timeout Error (attempted addresses: 2605:340::1:443, timeout: 10000ms)',
        },
      ],
    });
    expect(formatOpenAIAPIErrorDetails(fetchError, context)).toContain(
      'OpenAI fetch error (attempt 1): TypeError: fetch failed\nCause: ConnectTimeoutError [UND_ERR_CONNECT_TIMEOUT]: Connect Timeout Error (attempted addresses: 2605:340::1:443, timeout: 10000ms)',
    );
  });

  it('exposes raw body fields that a bare OpenAI APIError drops', async () => {
    const { callAI } = await import('@/ai-model/service-caller');
    const { getModelRuntime } = await import('@/ai-model/models');
    const actualOpenAI =
      await rs.importActual<typeof import('openai')>('openai');
    const rawResponseBody = JSON.stringify({
      detail: 'model does not exist',
      trace_id: 'trace_123',
    });
    const bareOpenAIError = actualOpenAI.default.APIError.generate(
      422,
      JSON.parse(rawResponseBody),
      'status code (no body)',
      new Headers({ 'x-request-id': 'req_123' }),
    );

    expect(bareOpenAIError.message).toBe('422 status code (no body)');
    expect(bareOpenAIError.message).not.toContain('model does not exist');
    expect(bareOpenAIError.message).not.toContain('trace_123');
    expect(bareOpenAIError.error).toBeUndefined();

    globalThis.fetch = rs.fn().mockResolvedValue(
      new Response(rawResponseBody, {
        status: 422,
        headers: { 'content-type': 'application/json' },
      }),
    );
    mockCreate.mockImplementation(async () => {
      // The mocked SDK does not call fetch, so trigger the configured fetch to
      // exercise Midscene's wrapper before throwing an SDK-shaped APIError.
      await mockOpenAIConstructor.mock.calls
        .at(-1)?.[0]
        .fetch('https://example.com/v1/chat/completions');
      throw bareOpenAIError;
    });

    const promise = callAI(
      [{ role: 'user', content: 'hello' }],
      getModelRuntime(baseConfig()),
    );

    await expect(promise).rejects.toThrow(
      /OpenAI raw error response body: \{"detail":"model does not exist","trace_id":"trace_123"\}/,
    );
  });
});
