import { ResolvedModelAdapter } from '@/ai-model/model-adapter/resolve';
import { getModelRuntime } from '@/ai-model/models';
import { callAI } from '@/ai-model/service-caller';
import { toResponsesInput } from '@/ai-model/service-caller/openai/responses/utils';
import type { ConversationMessage } from '@/ai-model/service-caller/types';
import { ConversationHistory } from '@/ai-model/workflows/planning/conversation-history';
import type { IModelConfig } from '@midscene/shared/env';
import { afterEach, beforeEach, describe, expect, it, rs } from '@rstest/core';

// Exercise the real SDK and HTTP wrapper without making model API calls.
const fetchMock = rs.fn<typeof fetch>();
const config: IModelConfig = {
  modelName: 'test-model',
  modelFamily: 'gpt-5',
  modelDescription: 'test model',
  openaiApiKey: 'test-key',
  openaiBaseURL: 'https://example.test/v1',
  apiType: 'responses',
  intent: 'default',
  slot: 'default',
  retryCount: 0,
  retryInterval: 0,
};
const messages: ConversationMessage[] = [
  { role: 'system', content: 'Return JSON.' },
  { role: 'assistant', content: [{ type: 'text', text: 'Previous answer' }] },
  {
    role: 'user',
    content: [
      { type: 'text', text: 'Inspect this image' },
      {
        type: 'image',
        url: 'data:image/png;base64,AA==',
      },
    ],
  },
];
const usage = {
  input_tokens: 10,
  output_tokens: 5,
  total_tokens: 15,
  input_tokens_details: { cached_tokens: 3 },
  output_tokens_details: { reasoning_tokens: 2 },
};
const response = (text = 'hello') => ({
  id: 'resp-test',
  object: 'response',
  status: 'completed',
  model: 'response-model',
  output: [
    {
      type: 'reasoning',
      id: 'rs-test',
      encrypted_content: 'encrypted-test-state',
      summary: [{ type: 'summary_text', text: 'thinking' }],
    },
    {
      type: 'message',
      id: 'msg-test',
      phase: 'final_answer',
      role: 'assistant',
      status: 'completed',
      content: [{ type: 'output_text', text, annotations: [] }],
    },
  ],
  usage,
});
const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json', 'x-request-id': 'req-test' },
  });
const sseResponse = (events: unknown[]) =>
  new Response(
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''),
    {
      headers: {
        'content-type': 'text/event-stream',
        'x-request-id': 'req-stream',
      },
    },
  );
const delta = { type: 'response.output_text.delta', delta: 'hello' };
const completed = { type: 'response.completed', response: response() };
const requestBody = (index = 0) =>
  JSON.parse(String(fetchMock.mock.calls[index][1]?.body));

beforeEach(() => {
  fetchMock.mockReset();
  rs.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(jsonResponse(response()));
});
afterEach(() => {
  rs.restoreAllMocks();
  rs.unstubAllGlobals();
});

const resolveImageDetail = new ResolvedModelAdapter({}, 'test')
  .resolveImageDetail;

describe('Responses protocol', () => {
  it('rejects an unadapted API type before initialization and retries', async () => {
    const createClient = rs.fn();
    const runtime = getModelRuntime({
      ...config,
      modelFamily: undefined,
      retryCount: 2,
      createOpenAIClient: createClient,
    });
    await expect(callAI(messages, runtime)).rejects.toThrow(
      'Model adapter "default" does not support API type "responses"',
    );
    expect(createClient).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'replays complete output in the next request (stream=%s)',
    async (stream) => {
      const runtime = getModelRuntime(config);
      fetchMock.mockResolvedValueOnce(
        stream ? sseResponse([delta, completed]) : jsonResponse(response()),
      );
      const history = new ConversationHistory({
        initialMessages: messages.map((message) => ({
          type: 'input-message',
          message,
        })),
      });
      const first = await callAI(history.snapshot(), runtime, {
        stream,
        onChunk: rs.fn(),
      });
      expect(first.rawAssistantOutput).toBeDefined();
      history.appendModelOutput(first.rawAssistantOutput!);
      history.appendMessage({
        role: 'user',
        content: 'Continue with the next step.',
      });
      await callAI(history.snapshot(), runtime);
      expect(requestBody(1).store).toBe(false);
      expect(requestBody(1)).not.toHaveProperty('previous_response_id');
      expect(requestBody(1).include).toBeUndefined();
      expect(requestBody(1).input).toEqual([
        ...requestBody(0).input,
        ...response().output,
        { role: 'user', content: 'Continue with the next step.' },
      ]);
    },
  );

  it.each([
    ['message.input_image.image_url'],
    ['message.input_image.image_url', 'reasoning.encrypted_content'],
  ])('preserves user include fields %j', async (...include) => {
    await callAI(
      messages,
      getModelRuntime({ ...config, extraBody: { include } }),
    );
    expect(requestBody().include).toEqual(include);
  });

  it('sends text, images and history through the SDK and reports normalized usage once', async () => {
    const runtime = getModelRuntime({
      ...config,
      reasoningEnabled: true,
      reasoningEffort: 'high',
      extraBody: { max_output_tokens: 200 },
    });
    const onUsage = rs.fn();
    runtime.onUsage = onUsage;
    const result = await callAI(messages, runtime, {
      requiresOriginalImageDetail: true,
      expectedJsonObjectResponse: true,
    });
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'https://example.test/v1/responses',
    );
    expect(requestBody()).toMatchObject({
      model: 'test-model',
      stream: false,
      store: false,
      reasoning: { effort: 'high', context: 'current_turn' },
      text: { format: { type: 'json_object' } },
      max_output_tokens: 200,
      input: [
        { role: 'system', content: 'Return JSON.' },
        {
          role: 'assistant',
          content: 'Previous answer',
        },
        {
          role: 'user',
          content: [
            { type: 'input_text', text: 'Inspect this image' },
            {
              type: 'input_image',
              detail: 'original',
              image_url: 'data:image/png;base64,AA==',
            },
          ],
        },
      ],
    });
    expect(requestBody()).not.toHaveProperty('response_format');
    expect(requestBody()).not.toHaveProperty('reasoning_effort');
    expect(messages[2].content).toContainEqual({
      type: 'image',
      url: 'data:image/png;base64,AA==',
    });
    expect(result).toMatchObject({
      content: 'hello',
      rawAssistantOutput: { type: 'responses', rawValue: response().output },
      reasoning_content: 'thinking',
      isStreamed: false,
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
        cached_input: 3,
        request_id: 'req-test',
        slot: 'default',
        retry_count: 0,
        api_type: 'responses',
      },
    });
    expect(onUsage).toHaveBeenCalledExactlyOnceWith(result.usage);
  });

  it('delivers deltas and sends the final chunk only after completion with usage', async () => {
    fetchMock.mockResolvedValue(
      sseResponse([
        { type: 'response.reasoning_summary_text.delta', delta: 'thinking' },
        delta,
        { type: 'response.output_text.done', text: 'hello' },
        completed,
      ]),
    );
    const onChunk = rs.fn();
    const runtime = getModelRuntime(config);
    runtime.onUsage = rs.fn();
    const result = await callAI(messages, runtime, { stream: true, onChunk });
    expect(requestBody().stream).toBe(true);
    expect(onChunk).toHaveBeenCalledTimes(3);
    expect(onChunk.mock.calls[0][0]).toMatchObject({
      reasoning_content: 'thinking',
      isComplete: false,
    });
    expect(onChunk.mock.calls[1][0]).toMatchObject({
      content: 'hello',
      accumulated: 'hello',
      isComplete: false,
    });
    expect(onChunk.mock.calls[2][0]).toMatchObject({
      isComplete: true,
      accumulated: 'hello',
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        completion_tokens_details: { reasoning_tokens: 2 },
      },
    });
    expect(onChunk.mock.calls[2][0].usage).not.toHaveProperty('slot');
    expect(result.rawAssistantOutput).toEqual({
      type: 'responses',
      rawValue: response().output,
    });
    expect(result.usage?.request_id).toBe('req-stream');
    expect(runtime.onUsage).toHaveBeenCalledExactlyOnceWith(result.usage);
  });

  it.each([false, true])(
    'does not estimate absent usage (stream=%s)',
    async (stream) => {
      const body = { ...response(), usage: undefined };
      fetchMock.mockResolvedValue(
        stream
          ? sseResponse([delta, { ...completed, response: body }])
          : jsonResponse(body),
      );
      const runtime = getModelRuntime(config);
      runtime.onUsage = rs.fn();
      const result = await callAI(messages, runtime, {
        stream,
        onChunk: rs.fn(),
      });
      expect(result.usage).toBeUndefined();
      expect(runtime.onUsage).not.toHaveBeenCalled();
    },
  );

  it('rejects empty stream output before delivering a completion chunk', async () => {
    fetchMock.mockResolvedValue(
      sseResponse([
        { type: 'response.reasoning_summary_text.delta', delta: 'thinking' },
        { type: 'response.completed', response: response('  ') },
      ]),
    );
    const onChunk = rs.fn();
    const runtime = getModelRuntime({ ...config, retryCount: 1 });
    runtime.onUsage = rs.fn();
    await expect(
      callAI(messages, runtime, { stream: true, onChunk }),
    ).rejects.toThrow('empty content from AI model');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onChunk).toHaveBeenCalledTimes(1);
    expect(onChunk.mock.calls[0][0].isComplete).toBe(false);
    expect(runtime.onUsage).not.toHaveBeenCalled();
  });

  it('retries empty content and prepares adapter parameters only once', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(response('  ')))
      .mockResolvedValueOnce(jsonResponse(response()));
    const runtime = getModelRuntime({ ...config, retryCount: 1 });
    const prepare = rs.spyOn(runtime.adapter.responses, 'buildResponsesParams');
    runtime.onUsage = rs.fn();
    const result = await callAI(messages, runtime);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(result.usage?.retry_count).toBe(1);
    expect(runtime.onUsage).toHaveBeenCalledTimes(1);
    expect(requestBody(0)).toEqual(requestBody(1));
  });

  it('retries a stream failure before any delivered output', async () => {
    fetchMock
      .mockResolvedValueOnce(
        sseResponse([{ type: 'error', message: 'temporary failure' }]),
      )
      .mockResolvedValueOnce(sseResponse([delta, completed]));
    const result = await callAI(
      messages,
      getModelRuntime({ ...config, retryCount: 1 }),
      { stream: true, onChunk: rs.fn() },
    );
    expect(result.usage?.retry_count).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    [{ type: 'error', message: 'stream failed' }],
    [
      {
        type: 'response.failed',
        response: {
          ...response(),
          status: 'failed',
          error: { message: 'failed' },
        },
      },
    ],
    [
      {
        type: 'response.incomplete',
        response: {
          ...response(),
          status: 'incomplete',
          incomplete_details: { reason: 'max_output_tokens' },
        },
      },
    ],
    [],
  ])(
    'does not replay delivered output or mark an interrupted stream complete: %j',
    async (...events) => {
      fetchMock.mockResolvedValue(sseResponse([delta, ...events]));
      const onChunk = rs.fn();
      const runtime = getModelRuntime({ ...config, retryCount: 1 });
      runtime.onUsage = rs.fn();
      await expect(
        callAI(messages, runtime, { stream: true, onChunk }),
      ).rejects.toThrow();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(onChunk).toHaveBeenCalledTimes(1);
      expect(onChunk.mock.calls[0][0].isComplete).toBe(false);
      expect(runtime.onUsage).not.toHaveBeenCalled();
    },
  );

  it('does not retry a callback failure', async () => {
    fetchMock.mockResolvedValue(sseResponse([delta, completed]));
    await expect(
      callAI(messages, getModelRuntime({ ...config, retryCount: 1 }), {
        stream: true,
        onChunk: () => {
          throw new Error('callback failed');
        },
      }),
    ).rejects.toThrow('callback failed');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(['failed', 'incomplete'])(
    'rejects a %s response even if it contains text',
    async (status) => {
      fetchMock.mockResolvedValue(jsonResponse({ ...response(), status }));
      await expect(callAI(messages, getModelRuntime(config))).rejects.toThrow(
        `Responses request ${status}`,
      );
    },
  );

  it('honors per-attempt timeout while the response body is stalled', async () => {
    let bodyController!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        bodyController = controller;
      },
    });
    fetchMock.mockResolvedValue(
      new Response(body, { headers: { 'content-type': 'application/json' } }),
    );
    try {
      await expect(
        callAI(messages, getModelRuntime({ ...config, timeout: 20 })),
      ).rejects.toThrow('hard timeout');
      expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    } finally {
      bodyController.close();
    }
  });

  it('preserves external cancellation and does not retry', async () => {
    const controller = new AbortController();
    const reason = new Error('user cancelled');
    fetchMock.mockImplementation(async () => {
      controller.abort(reason);
      return jsonResponse(response());
    });
    await expect(
      callAI(messages, getModelRuntime({ ...config, retryCount: 2 }), {
        abortSignal: controller.signal,
      }),
    ).rejects.toBe(reason);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps GPT-6 native reasoning and extraBody overrides', async () => {
    await callAI(
      messages,
      getModelRuntime({
        ...config,
        modelFamily: 'gpt-6',
        temperature: 0.5,
        extraBody: { text: { format: { type: 'text' } } },
      }),
      { expectedJsonObjectResponse: true },
    );
    expect(requestBody()).toMatchObject({
      reasoning: { effort: 'low', context: 'current_turn' },
      text: { format: { type: 'text' } },
    });
    expect(requestBody()).not.toHaveProperty('temperature');
  });

  it('keeps Chat Completions as the default protocol', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        choices: [{ message: { role: 'assistant', content: 'chat' } }],
      }),
    );
    const result = await callAI(
      messages,
      getModelRuntime({ ...config, apiType: undefined }),
    );
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'https://example.test/v1/chat/completions',
    );
    expect(result.content).toBe('chat');
  });

  it('rejects background mode during preparation', async () => {
    await expect(
      callAI(
        messages,
        getModelRuntime({
          ...config,
          extraBody: { background: true },
          retryCount: 2,
        }),
      ),
    ).rejects.toThrow('background');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('converts text messages and joins assistant text parts', () => {
    expect(
      toResponsesInput(
        [
          { role: 'system', content: 'System instructions' },
          { role: 'user', content: 'User request' },
          { role: 'assistant', content: 'Previous response' },
          {
            type: 'input-message',
            message: {
              role: 'assistant',
              content: [
                { type: 'text', text: 'First part' },
                { type: 'text', text: ' second part' },
              ],
            },
          },
        ],
        resolveImageDetail,
      ),
    ).toEqual([
      { role: 'system', content: 'System instructions' },
      { role: 'user', content: 'User request' },
      { role: 'assistant', content: 'Previous response' },
      { role: 'assistant', content: 'First part second part' },
    ]);
  });

  it('rejects Chat Completions raw output in Responses history', () => {
    expect(() =>
      toResponsesInput(
        [
          {
            type: 'model-output',
            output: {
              type: 'chat-completion',
              rawValue: { role: 'assistant', content: 'Answer', refusal: null },
            },
          },
        ],
        resolveImageDetail,
      ),
    ).toThrow(
      'Cannot replay Chat Completions output in a Responses conversation',
    );
  });
});
