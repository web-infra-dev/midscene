import type { IModelConfig } from '@midscene/shared/env';
import { afterEach, beforeEach, describe, expect, it, rs } from '@rstest/core';

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

  afterEach(() => {
    rs.unmock('@/ai-model/service-caller/model-call-recorder');
    rs.resetModules();
  });

  it('records non-2xx raw response body without changing the response', async () => {
    const { wrapOpenAICompatibleFetch } = await import(
      '@/ai-model/service-caller/openai/openai-request-context'
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
      responseRequestId: { requestId: 'req_123', status: 422, ok: false },
      rawResponseBody: responseBody,
    });
  });

  it('does not record successful response bodies', async () => {
    const { wrapOpenAICompatibleFetch } = await import(
      '@/ai-model/service-caller/openai/openai-request-context'
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

  it('does not include request headers in model record events', async () => {
    const { wrapOpenAICompatibleFetch } = await import(
      '@/ai-model/service-caller/openai/openai-request-context'
    );
    const events: Array<Record<string, unknown>> = [];
    const context = {
      recordEvent: (event: Record<string, unknown>) => events.push(event),
    };
    globalThis.fetch = rs.fn().mockResolvedValue(new Response(null));

    await wrapOpenAICompatibleFetch(context)('https://example.com', {
      method: 'POST',
      headers: { authorization: 'Bearer secret-api-key' },
      body: JSON.stringify({ model: 'example-model' }),
    });

    expect(events).toEqual([
      {
        type: 'request',
        request: {
          url: 'https://example.com/',
          method: 'POST',
          body: JSON.stringify({ model: 'example-model' }),
        },
      },
    ]);
    expect(JSON.stringify(events)).not.toContain('secret-api-key');
  });

  it('uses x-model-request-id as usage request_id when x-request-id is absent', async () => {
    const { callAI } = await import('@/ai-model/service-caller');
    const { getModelRuntime } = await import('@/ai-model/models');
    globalThis.fetch = rs.fn().mockResolvedValue(
      new Response(null, {
        headers: { 'x-model-request-id': 'model_req_123' },
      }),
    );
    mockCreate.mockImplementation(async () => {
      await mockOpenAIConstructor.mock.calls
        .at(-1)?.[0]
        .fetch('https://example.com/v1/chat/completions');
      return {
        choices: [{ message: { content: 'hello' } }],
        usage: {
          prompt_tokens: 1,
          completion_tokens: 1,
          total_tokens: 2,
        },
        _request_id: null,
      };
    });

    const response = await callAI(
      [{ role: 'user', content: 'hello' }],
      getModelRuntime(baseConfig()),
    );

    expect(response.usage?.request_id).toBe('model_req_123');
  });

  it('prefers x-request-id over x-model-request-id', async () => {
    const { callAI } = await import('@/ai-model/service-caller');
    const { getModelRuntime } = await import('@/ai-model/models');
    globalThis.fetch = rs.fn().mockResolvedValue(
      new Response(null, {
        headers: {
          'x-request-id': 'req_123',
          'x-model-request-id': 'model_req_123',
        },
      }),
    );
    mockCreate.mockImplementation(async () => {
      await mockOpenAIConstructor.mock.calls
        .at(-1)?.[0]
        .fetch('https://example.com/v1/chat/completions');
      return {
        choices: [{ message: { content: 'hello' } }],
        usage: {
          prompt_tokens: 1,
          completion_tokens: 1,
          total_tokens: 2,
        },
        _request_id: null,
      };
    });

    const response = await callAI(
      [{ role: 'user', content: 'hello' }],
      getModelRuntime(baseConfig()),
    );

    expect(response.usage?.request_id).toBe('req_123');
  });

  it('prefers SDK request ID over response headers', async () => {
    const { callAI } = await import('@/ai-model/service-caller');
    const { getModelRuntime } = await import('@/ai-model/models');
    globalThis.fetch = rs.fn().mockResolvedValue(
      new Response(null, {
        headers: {
          'x-request-id': 'req_123',
          'x-model-request-id': 'model_req_123',
        },
      }),
    );
    mockCreate.mockImplementation(async () => {
      await mockOpenAIConstructor.mock.calls
        .at(-1)?.[0]
        .fetch('https://example.com/v1/chat/completions');
      return {
        choices: [{ message: { content: 'hello' } }],
        usage: {
          prompt_tokens: 1,
          completion_tokens: 1,
          total_tokens: 2,
        },
        _request_id: 'sdk_req_123',
      };
    });

    const response = await callAI(
      [{ role: 'user', content: 'hello' }],
      getModelRuntime(baseConfig()),
    );

    expect(response.usage?.request_id).toBe('sdk_req_123');
  });

  it('keeps request details isolated between attempts', async () => {
    const { wrapOpenAICompatibleFetch, formatOpenAIAPIErrorDetails } =
      await import('@/ai-model/service-caller/openai/openai-request-context');
    const firstContext = {};
    const secondContext = {};
    globalThis.fetch = rs
      .fn()
      .mockResolvedValueOnce(
        new Response('first failure', {
          status: 500,
          headers: { 'x-request-id': 'first_request' },
        }),
      )
      .mockResolvedValueOnce(new Response('second failure', { status: 502 }));

    await wrapOpenAICompatibleFetch(firstContext)('https://example.com');
    await wrapOpenAICompatibleFetch(secondContext)('https://example.com');

    expect(firstContext).toEqual({
      rawResponseBody: 'first failure',
      responseRequestId: { requestId: 'first_request', status: 500, ok: false },
    });
    expect(secondContext).toEqual({ rawResponseBody: 'second failure' });
    expect(formatOpenAIAPIErrorDetails(undefined, secondContext)).toBe(
      '\nOpenAI raw error response body: second failure',
    );
  });

  it('records and reports original fetch errors before rethrowing them', async () => {
    const { formatOpenAIAPIErrorDetails, wrapOpenAICompatibleFetch } =
      await import('@/ai-model/service-caller/openai/openai-request-context');
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
      fetchError:
        'TypeError: fetch failed\nCause: ConnectTimeoutError [UND_ERR_CONNECT_TIMEOUT]: Connect Timeout Error (attempted addresses: 2605:340::1:443, timeout: 10000ms)',
    });
    expect(formatOpenAIAPIErrorDetails(fetchError, context)).toContain(
      'OpenAI fetch error: TypeError: fetch failed\nCause: ConnectTimeoutError [UND_ERR_CONNECT_TIMEOUT]: Connect Timeout Error (attempted addresses: 2605:340::1:443, timeout: 10000ms)',
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
        headers: {
          'content-type': 'application/json',
          'x-model-request-id': 'model_req_123',
        },
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
    await expect(promise).rejects.toThrow(
      /OpenAI error response request ID \(status 422\): model_req_123/,
    );
  });

  it.each([
    {
      name: 'non-JSON response without choices',
      contentType: 'application/octet-stream',
      body: '\u001f\ufffd\bcompressed response',
      error: 'invalid response from LLM service',
    },
    {
      name: 'invalid JSON',
      contentType: 'application/json',
      body: '{invalid JSON',
      error: 'JSON',
    },
    {
      name: 'empty completion content',
      contentType: 'application/json',
      body: JSON.stringify({ choices: [{ message: { content: '' } }] }),
      error: 'empty content from AI model',
    },
  ])(
    'records HTTP 200 details for $name',
    async ({ contentType, body, error }) => {
      const events: Array<Record<string, unknown>> = [];
      rs.resetModules();
      rs.doMock('@/ai-model/service-caller/model-call-recorder', () => ({
        isModelCallRecordingEnabled: () => true,
        recordModelCallEvent: (event: Record<string, unknown>) => {
          events.push(event);
        },
      }));
      const { callAI } = await import('@/ai-model/service-caller');
      const { getModelRuntime } = await import('@/ai-model/models');
      const actualOpenAI =
        await rs.importActual<typeof import('openai')>('openai');
      mockOpenAIConstructor.mockImplementationOnce(
        (options) => new actualOpenAI.default(options),
      );
      // This is the response after Fetch processing, not raw network bytes.
      globalThis.fetch = rs.fn().mockResolvedValue(
        new Response(body, {
          status: 200,
          headers: {
            'content-type': contentType,
            'content-encoding': 'gzip',
            'x-request-id': 'req_parse_failure',
          },
        }),
      );

      await expect(
        callAI(
          [{ role: 'user', content: 'hello' }],
          getModelRuntime(baseConfig()),
        ),
      ).rejects.toThrow(error);

      expect(events.map((event) => event.type)).toEqual(['request', 'error']);
      expect(events[1]).toMatchObject({
        status: 200,
        ok: true,
        body,
        headers: expect.arrayContaining([
          ['content-type', contentType],
          ['content-encoding', 'gzip'],
          ['x-request-id', 'req_parse_failure'],
        ]),
        error: expect.stringContaining(error),
        attempt: 1,
        executionId: events[0].executionId,
        callId: events[0].callId,
      });
    },
  );

  it('uses the successful retry attempt for the final record', async () => {
    const events: Array<Record<string, unknown>> = [];
    rs.resetModules();
    rs.doMock('@/ai-model/service-caller/model-call-recorder', () => ({
      isModelCallRecordingEnabled: () => true,
      recordModelCallEvent: (event: Record<string, unknown>) => {
        events.push(event);
      },
    }));
    const { callAI } = await import('@/ai-model/service-caller');
    const { getModelRuntime } = await import('@/ai-model/models');
    globalThis.fetch = rs
      .fn()
      .mockResolvedValueOnce(new Response('temporary failure', { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })));
    mockCreate.mockImplementation(async () => {
      const response = await mockOpenAIConstructor.mock.calls
        .at(-1)?.[0]
        .fetch('https://example.com/v1/chat/completions', {
          method: 'POST',
          body: JSON.stringify({ model: 'gpt-4o' }),
        });
      if (!response.ok) {
        throw new Error('temporary failure');
      }
      return {
        choices: [{ message: { content: 'hello' } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      };
    });

    await callAI(
      [{ role: 'user', content: 'hello' }],
      getModelRuntime(baseConfig({ retryCount: 1, retryInterval: 0 })),
    );

    expect(events.map((event) => [event.type, event.attempt])).toEqual([
      ['request', 1],
      ['error', 1],
      ['request', 2],
      ['response', 2],
    ]);
    const executionIds = [...new Set(events.map((event) => event.executionId))];
    expect(executionIds).toHaveLength(1);
    expect(executionIds[0]).toMatch(/^unscoped-/);
  });

  it('records every streaming chunk with its sequence', async () => {
    const events: Array<Record<string, unknown>> = [];
    rs.resetModules();
    rs.doMock('@/ai-model/service-caller/model-call-recorder', () => ({
      isModelCallRecordingEnabled: () => true,
      recordModelCallEvent: (event: Record<string, unknown>) => {
        events.push(event);
      },
    }));
    const { callAI } = await import('@/ai-model/service-caller');
    const { getModelRuntime } = await import('@/ai-model/models');
    globalThis.fetch = rs.fn().mockResolvedValue(
      new Response(null, {
        headers: { 'content-type': 'text/event-stream' },
      }),
    );
    mockCreate.mockImplementation(async () => {
      await mockOpenAIConstructor.mock.calls
        .at(-1)?.[0]
        .fetch('https://example.com/v1/chat/completions', {
          method: 'POST',
          body: JSON.stringify({ model: 'gpt-4o' }),
        });
      return (async function* () {
        yield { choices: [{ delta: { content: 'hel' } }] };
        yield {
          choices: [{ delta: { content: 'lo' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        };
      })();
    });

    await callAI(
      [{ role: 'user', content: 'hello' }],
      getModelRuntime(baseConfig()),
      { stream: true, onChunk: rs.fn() },
    );

    expect(
      events
        .filter((event) => event.type === 'chunk')
        .map((event) => [event.attempt, event.sequence]),
    ).toEqual([
      [1, 1],
      [1, 2],
    ]);
    expect(events.at(-1)).toMatchObject({ type: 'response', attempt: 1 });
  });
});
