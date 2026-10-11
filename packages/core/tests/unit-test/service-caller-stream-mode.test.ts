import { getModelRuntime } from '@/ai-model/models';
import { callAI } from '@/ai-model/service-caller';
import {
  type IModelConfig,
  MIDSCENE_MODEL_STREAM_MODE,
} from '@midscene/shared/env';
import { afterEach, beforeEach, describe, expect, it, rs } from '@rstest/core';

const fetchMock = rs.fn<typeof fetch>();
const messages = [{ role: 'user' as const, content: 'Hello' }];
const response = {
  id: 'resp-test',
  status: 'completed',
  model: 'test-model',
  output: [
    {
      type: 'message',
      role: 'assistant',
      content: [{ type: 'output_text', text: 'Hello' }],
    },
  ],
  usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12 },
};
const chatResponse = {
  choices: [{ message: { content: 'Hello' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
};
const sse = (events: unknown[]) =>
  new Response(
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''),
    { headers: { 'content-type': 'text/event-stream' } },
  );

beforeEach(() => {
  fetchMock.mockReset();
  rs.stubEnv(MIDSCENE_MODEL_STREAM_MODE, undefined);
  rs.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  rs.unstubAllGlobals();
  rs.unstubAllEnvs();
});

describe('model request stream mode', () => {
  for (const protocol of ['openai-chat', 'openai-responses'] as const) {
    const config: IModelConfig = {
      modelName: 'test-model',
      modelFamily: 'gpt-5',
      modelDescription: 'test',
      openaiApiKey: 'test-key',
      openaiBaseURL: 'https://example.test/v1',
      intent: 'default',
      slot: 'default',
      protocol,
      retryCount: 0,
    };
    it(`${protocol}: aggregates an environment-enabled stream without a chunk callback`, async () => {
      rs.stubEnv(MIDSCENE_MODEL_STREAM_MODE, 'stream');
      fetchMock.mockResolvedValue(
        sse(
          protocol === 'openai-responses'
            ? [
                { type: 'response.output_text.delta', delta: 'Hello' },
                { type: 'response.completed', response },
              ]
            : [
                {
                  choices: [
                    { index: 0, delta: { role: 'assistant', content: 'Hel' } },
                  ],
                },
                {
                  choices: [
                    {
                      index: 0,
                      delta: { content: 'lo' },
                      finish_reason: 'stop',
                    },
                  ],
                },
                { choices: [], usage: chatResponse.usage },
              ],
        ),
      );
      const runtime = getModelRuntime(config);
      runtime.onUsage = rs.fn();
      const result = await callAI(messages, runtime);
      expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).stream).toBe(
        true,
      );
      expect(result).toMatchObject({
        content: 'Hello',
        isStreamed: true,
        usage: { total_tokens: 12, stream: true },
      });
      expect(runtime.onUsage).toHaveBeenCalledTimes(1);
      expect(result.rawAssistantOutput).toMatchObject(
        protocol === 'openai-responses'
          ? { type: 'responses', rawValue: response.output }
          : {
              type: 'chat-completion',
              rawValue: { role: 'assistant', content: 'Hello' },
            },
      );
    });
    for (const mode of [undefined, 'non-stream', 'stream'] as const) {
      it(`${protocol}: non-streaming with mode ${mode} and explicit override when needed`, async () => {
        rs.stubEnv(MIDSCENE_MODEL_STREAM_MODE, mode);
        fetchMock.mockResolvedValue(
          Response.json(
            protocol === 'openai-responses' ? response : chatResponse,
          ),
        );
        const result = await callAI(
          messages,
          getModelRuntime(config),
          mode === 'stream' ? { stream: false } : undefined,
        );
        expect(
          JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).stream,
        ).toBe(false);
        expect(result).toMatchObject({
          content: 'Hello',
          isStreamed: false,
          usage: { total_tokens: 12, stream: false },
        });
      });
    }
    it(`${protocol}: explicit streaming overrides non-stream mode`, async () => {
      rs.stubEnv(MIDSCENE_MODEL_STREAM_MODE, 'non-stream');
      fetchMock.mockResolvedValue(
        sse(
          protocol === 'openai-responses'
            ? [
                { type: 'response.output_text.delta', delta: 'Hello' },
                { type: 'response.completed', response },
              ]
            : [
                {
                  choices: [
                    {
                      index: 0,
                      delta: { role: 'assistant', content: 'Hello' },
                      finish_reason: 'stop',
                    },
                  ],
                },
                { choices: [], usage: chatResponse.usage },
              ],
        ),
      );
      const onChunk = rs.fn();
      const result = await callAI(messages, getModelRuntime(config), {
        stream: true,
        onChunk,
      });
      expect(result.content).toBe('Hello');
      expect(result.isStreamed).toBe(true);
      expect(result.usage?.stream).toBe(true);
      expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).stream).toBe(
        true,
      );
      expect(onChunk).toHaveBeenCalled();
    });
    it(`${protocol}: skips environment parsing when stream is explicitly specified`, async () => {
      rs.stubEnv(MIDSCENE_MODEL_STREAM_MODE, 'invalid');
      fetchMock.mockResolvedValue(
        Response.json(
          protocol === 'openai-responses' ? response : chatResponse,
        ),
      );
      const result = await callAI(messages, getModelRuntime(config), {
        stream: false,
      });
      expect(result.isStreamed).toBe(false);
      expect(result.content).toBe('Hello');
    });
    for (const mode of ['auto', 'true', 'invalid']) {
      it(`${protocol}: rejects unsupported mode ${mode} before fetching`, async () => {
        rs.stubEnv(MIDSCENE_MODEL_STREAM_MODE, mode);
        await expect(callAI(messages, getModelRuntime(config))).rejects.toThrow(
          'Invalid MIDSCENE_MODEL_STREAM_MODE',
        );
        expect(fetchMock).not.toHaveBeenCalled();
      });
    }
  }
  it('rejects a truncated environment-enabled Responses stream instead of returning partial text', async () => {
    rs.stubEnv(MIDSCENE_MODEL_STREAM_MODE, 'stream');
    fetchMock.mockResolvedValue(
      sse([{ type: 'response.output_text.delta', delta: 'partial' }]),
    );
    await expect(
      callAI(
        messages,
        getModelRuntime({
          modelName: 'test',
          modelFamily: 'gpt-5',
          modelDescription: 'test',
          openaiApiKey: 'test-key',
          openaiBaseURL: 'https://example.test/v1',
          intent: 'default',
          slot: 'default',
          protocol: 'openai-responses',
          retryCount: 0,
        }),
      ),
    ).rejects.toThrow('without a completed response');
  });
});
