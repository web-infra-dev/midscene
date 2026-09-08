import { getModelRuntime } from '@/ai-model/models';
import { callAI } from '@/ai-model/service-caller';
import type { IModelConfig } from '@midscene/shared/env';
import { beforeEach, describe, expect, it, rs } from '@rstest/core';

const mockCreate = rs.fn();
const mockCodexCall = rs.hoisted(() => rs.fn());

rs.mock('@/ai-model/service-caller/codex/codex-app-server', () => ({
  isCodexAppServerProvider: (url?: string) => url === 'codex://app-server',
  callAIWithCodexAppServer: mockCodexCall,
}));

rs.mock('openai', () => ({
  default: rs.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockCreate,
      },
    },
  })),
}));

const baseModelConfig: IModelConfig = {
  modelName: 'gpt-5.4',
  modelDescription: 'test',
  openaiApiKey: 'test-key',
  openaiBaseURL: 'https://api.openai.com/v1',
  modelFamily: 'gpt-5',
  intent: 'default',
  slot: 'default',
};

const imageMessage = [
  {
    role: 'user' as const,
    content: [
      {
        type: 'image_url' as const,
        image_url: {
          url: 'https://example.com/shot.png',
          detail: 'high' as const,
        },
      },
      {
        type: 'text' as const,
        text: 'Inspect this screenshot.',
      },
    ],
  },
];

describe('GPT image detail handling', () => {
  beforeEach(() => {
    mockCodexCall.mockReset();
    mockCodexCall.mockResolvedValue({ content: 'ok', isStreamed: false });
    mockCreate.mockReset();
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: 'ok' } }],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
      },
    });
  });

  it.each(['https://api.openai.com/v1', 'codex://app-server'])(
    'rejects streaming without onChunk before calling %s',
    async (openaiBaseURL) => {
      await expect(
        callAI(
          imageMessage,
          getModelRuntime({ ...baseModelConfig, openaiBaseURL }),
          { stream: true },
        ),
      ).rejects.toThrow('onChunk is required when stream is true');
      expect(mockCreate).not.toHaveBeenCalled();
      expect(mockCodexCall).not.toHaveBeenCalled();
    },
  );

  it.each([false, undefined])(
    'keeps the request non-streaming when stream is %s even with onChunk',
    async (stream) => {
      const onChunk = rs.fn();
      const response = await callAI(
        imageMessage,
        getModelRuntime(baseModelConfig),
        { stream, onChunk },
      );
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ stream: false }),
        expect.anything(),
      );
      expect(response.isStreamed).toBe(false);
      expect(onChunk).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, 'max'])(
    'passes resolved GPT-6 effort to Codex for %s',
    async (reasoningEffort) => {
      await callAI(
        imageMessage,
        getModelRuntime({
          ...baseModelConfig,
          modelName: 'gpt-6-astra',
          modelFamily: 'gpt-6',
          openaiBaseURL: 'codex://app-server',
          reasoningEnabled: true,
          reasoningEffort,
        }),
      );
      expect(mockCodexCall).toHaveBeenCalledWith(
        imageMessage,
        expect.anything(),
        expect.objectContaining({
          params: { effort: reasoningEffort ?? 'medium' },
          imageDetail: 'original',
        }),
      );
      expect(mockCreate).not.toHaveBeenCalled();
    },
  );

  it.each([
    {
      intent: 'default',
      requiresOriginalImageDetail: false,
      expected: 'original',
    },
    {
      intent: 'planning',
      requiresOriginalImageDetail: false,
      expected: undefined,
    },
    {
      intent: 'planning',
      requiresOriginalImageDetail: true,
      expected: 'original',
    },
  ] as const)(
    'resolves Codex image detail independently for %j',
    async ({ intent, requiresOriginalImageDetail, expected }) => {
      for (const modelFamily of ['gpt-5', 'gpt-6'] as const) {
        const runtime = getModelRuntime({
          ...baseModelConfig,
          modelFamily,
          intent,
          openaiBaseURL: 'codex://app-server',
        });
        const chatDetailSpy = rs.spyOn(
          runtime.adapter.chatCompletion,
          'resolveImageDetail',
        );
        try {
          await callAI(imageMessage, runtime, { requiresOriginalImageDetail });
          expect(mockCodexCall.mock.calls.at(-1)?.[2].imageDetail).toBe(
            expected,
          );
          expect(chatDetailSpy).not.toHaveBeenCalled();
        } finally {
          chatDetailSpy.mockRestore();
        }
      }
    },
  );

  it('overrides image detail to original for gpt-5 default intent requests', async () => {
    await callAI(imageMessage, getModelRuntime(baseModelConfig));

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: 'https://example.com/shot.png',
                  detail: 'original',
                },
              },
              {
                type: 'text',
                text: 'Inspect this screenshot.',
              },
            ],
          },
        ],
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('keeps the original image detail for non-default intents', async () => {
    await callAI(
      imageMessage,
      getModelRuntime({
        ...baseModelConfig,
        intent: 'planning',
        slot: 'planning',
      }),
    );

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: 'https://example.com/shot.png',
                  detail: 'high',
                },
              },
              {
                type: 'text',
                text: 'Inspect this screenshot.',
              },
            ],
          },
        ],
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('overrides image detail to original when required by the caller and adapter', async () => {
    await callAI(
      imageMessage,
      getModelRuntime({
        ...baseModelConfig,
        intent: 'planning',
        slot: 'planning',
      }),
      {
        requiresOriginalImageDetail: true,
      },
    );

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: 'https://example.com/shot.png',
                  detail: 'original',
                },
              },
              {
                type: 'text',
                text: 'Inspect this screenshot.',
              },
            ],
          },
        ],
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('lets extraBody override gpt-5 standard temperature policy', async () => {
    await callAI(
      imageMessage,
      getModelRuntime({
        ...baseModelConfig,
        extraBody: {
          temperature: 0.7,
        },
      }),
    );

    expect(mockCreate.mock.calls[0][0]).toHaveProperty('temperature', 0.7);
  });

  it('preserves standard model temperature for gpt-5', async () => {
    await callAI(
      imageMessage,
      getModelRuntime({
        ...baseModelConfig,
        temperature: 0.7,
      }),
    );

    expect(mockCreate.mock.calls[0][0]).toHaveProperty('temperature', 0.7);
  });

  it('sends GPT-6 screenshots through Chat Completions with compatible defaults', async () => {
    await callAI(
      imageMessage,
      getModelRuntime({
        ...baseModelConfig,
        modelFamily: 'gpt-6',
        modelName: 'gpt-6-astra',
        temperature: 0.7,
      }),
      { semanticRetryAttempt: 1, expectedJsonObjectResponse: true },
    );

    const request = mockCreate.mock.calls[0][0];
    expect(request).toMatchObject({
      model: 'gpt-6-astra',
      reasoning_effort: 'low',
      response_format: { type: 'json_object' },
    });
    expect(JSON.parse(JSON.stringify(request))).not.toHaveProperty(
      'temperature',
    );
    expect(request.messages[0].content[0].image_url.detail).toBe('original');
  });
});
