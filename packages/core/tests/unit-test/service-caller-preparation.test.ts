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

describe('model call parameter preparation', () => {
  beforeEach(() => {
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
      } finally {
        prepare.mockRestore();
      }
    },
  );

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
