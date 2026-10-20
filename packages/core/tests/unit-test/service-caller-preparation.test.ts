import { getModelRuntime } from '@/ai-model/models';
import { callAI } from '@/ai-model/service-caller';
import type { IModelConfig } from '@midscene/shared/env';
import { beforeEach, describe, expect, it, rs } from '@rstest/core';

const mockCreate = rs.fn();
const mockCodexCall = rs.hoisted(() => rs.fn());
const mockProxy = rs.hoisted(() => rs.fn());

rs.mock('@/ai-model/service-caller/proxy', () => ({
  createProxyAgentIfNeeded: mockProxy,
}));

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
        type: 'image' as const,
        url: 'https://example.com/shot.png',
      },
      {
        type: 'text' as const,
        text: 'Inspect this screenshot.',
      },
    ],
  },
];

describe('model call parameter preparation', () => {
  beforeEach(() => {
    rs.clearAllMocks();
    mockProxy.mockReset().mockResolvedValue(undefined);
    mockCodexCall.mockReset();
    mockCodexCall.mockResolvedValue({
      content: 'ok',
      isStreamed: false,
      protocolMetadata: {
        transport: 'json-rpc',
        threadId: 'thread-test',
        turnId: 'turn-test',
        turnStatus: 'completed',
      },
    });
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

  it.each([
    { semanticRetryAttempt: 0, expected: 0 },
    { semanticRetryAttempt: 1, expected: 0.2 },
    { semanticRetryAttempt: 2, temperature: 0, expected: 0 },
    { semanticRetryAttempt: 1, temperature: 0.7, expected: 0.7 },
    { semanticRetryAttempt: 1, extraBody: { temperature: 0 }, expected: 0 },
  ])(
    'prepares retry temperature with user overrides: %j',
    async ({ semanticRetryAttempt, expected, ...overrides }) => {
      const runtime = getModelRuntime({ ...baseModelConfig, ...overrides });
      await callAI(imageMessage, runtime, { semanticRetryAttempt });
      expect(mockCreate.mock.calls[0][0].temperature).toBe(expected);
    },
  );

  it('does not add a temperature for models that omit it on semantic retry', async () => {
    await callAI(
      imageMessage,
      getModelRuntime({ ...baseModelConfig, modelFamily: 'gpt-6' }),
      { semanticRetryAttempt: 1 },
    );
    expect(
      JSON.parse(JSON.stringify(mockCreate.mock.calls[0][0])),
    ).not.toHaveProperty('temperature');
  });

  it('reuses the prepared temperature across request retries', async () => {
    mockCreate.mockRejectedValueOnce(new Error('temporary request failure'));
    await callAI(
      imageMessage,
      getModelRuntime({ ...baseModelConfig, retryCount: 1, retryInterval: 0 }),
      { semanticRetryAttempt: 1 },
    );
    expect(mockCreate.mock.calls.map(([body]) => body.temperature)).toEqual([
      0.2, 0.2,
    ]);
  });

  it.each(['chat', 'codex'])(
    'prepares %s parameters only once across retries',
    async (protocol) => {
      const runtime = getModelRuntime({
        ...baseModelConfig,
        openaiBaseURL:
          protocol === 'codex'
            ? 'codex://app-server'
            : baseModelConfig.openaiBaseURL,
        retryCount: 1,
        retryInterval: 0,
      });
      const prepare =
        protocol === 'codex'
          ? rs.spyOn(runtime.adapter, 'buildCodexAppServerParams')
          : rs.spyOn(
              runtime.adapter.chatCompletion,
              'buildChatCompletionParams',
            );
      const request = protocol === 'codex' ? mockCodexCall : mockCreate;
      const proxy = {};
      mockProxy.mockResolvedValue(proxy);
      request.mockRejectedValueOnce(new Error('temporary request failure'));
      try {
        await callAI(imageMessage, runtime);
        expect(prepare).toHaveBeenCalledTimes(1);
        expect(request).toHaveBeenCalledTimes(2);
        const firstMessages =
          protocol === 'codex'
            ? request.mock.calls[0][0]
            : request.mock.calls[0][0].messages;
        const secondMessages =
          protocol === 'codex'
            ? request.mock.calls[1][0]
            : request.mock.calls[1][0].messages;
        expect(firstMessages).toBe(secondMessages);
        if (protocol === 'chat') {
          const OpenAI = (await import('openai'))
            .default as unknown as ReturnType<typeof rs.fn>;
          expect(mockProxy).toHaveBeenCalledTimes(1);
          expect(
            OpenAI.mock.calls.map(
              ([options]) => options.fetchOptions.dispatcher,
            ),
          ).toEqual([proxy, proxy]);
        } else {
          expect(mockProxy).not.toHaveBeenCalled();
        }
      } finally {
        prepare.mockRestore();
      }
    },
  );

  it('does not retry proxy initialization errors', async () => {
    const failure = new Error('invalid proxy');
    mockProxy.mockRejectedValue(failure);
    await expect(
      callAI(
        imageMessage,
        getModelRuntime({
          ...baseModelConfig,
          retryCount: 2,
          retryInterval: 0,
        }),
      ),
    ).rejects.toBe(failure);
    expect(mockProxy).toHaveBeenCalledTimes(1);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('cancels proxy preparation without starting a request afterwards', async () => {
    let finish!: () => void;
    let notifyStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      notifyStarted = resolve;
    });
    mockProxy.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
          notifyStarted();
        }),
    );
    const controller = new AbortController();
    const reason = new Error('cancelled');
    const pending = callAI(imageMessage, getModelRuntime(baseModelConfig), {
      abortSignal: controller.signal,
    });
    const rejected = expect(pending).rejects.toBe(reason);
    await started;
    controller.abort(reason);
    await rejected;
    finish();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockCodexCall).not.toHaveBeenCalled();
  });

  it.each(['chat', 'codex'])(
    'does not retry %s parameter preparation errors',
    async (protocol) => {
      const runtime = getModelRuntime({
        ...baseModelConfig,
        openaiBaseURL:
          protocol === 'codex'
            ? 'codex://app-server'
            : baseModelConfig.openaiBaseURL,
        retryCount: 2,
        retryInterval: 0,
      });
      const failure = new Error('invalid parameters');
      const prepare =
        protocol === 'codex'
          ? rs.spyOn(runtime.adapter, 'buildCodexAppServerParams')
          : rs.spyOn(
              runtime.adapter.chatCompletion,
              'buildChatCompletionParams',
            );
      prepare.mockImplementation(() => {
        throw failure;
      });
      try {
        await expect(callAI(imageMessage, runtime)).rejects.toBe(failure);
        expect(prepare).toHaveBeenCalledTimes(1);
        expect(mockCreate).not.toHaveBeenCalled();
        expect(mockCodexCall).not.toHaveBeenCalled();
      } finally {
        prepare.mockRestore();
      }
    },
  );
});
