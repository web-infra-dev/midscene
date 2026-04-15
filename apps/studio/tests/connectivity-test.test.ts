import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@midscene/core/ai-model', () => ({
  callAIWithStringResponse: vi.fn(),
}));

import { callAIWithStringResponse } from '@midscene/core/ai-model';
import { runConnectivityTest } from '../src/main/playground/connectivity-test';

describe('runConnectivityTest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs the connectivity probe through the shared AI caller', async () => {
    vi.mocked(callAIWithStringResponse).mockResolvedValue({
      content: 'CONNECTIVITY_OK',
    } as never);

    const result = await runConnectivityTest({
      apiKey: 'sk-test',
      baseUrl: 'https://api.example.com/v1',
      model: 'gpt-4o',
    });

    expect(result).toEqual({
      ok: true,
      sample: 'CONNECTIVITY_OK',
    });
    expect(callAIWithStringResponse).toHaveBeenCalledWith(
      [
        {
          role: 'system',
          content: 'Reply with the exact token the user asks for.',
        },
        {
          role: 'user',
          content: 'Return exactly CONNECTIVITY_OK',
        },
      ],
      expect.objectContaining({
        openaiApiKey: 'sk-test',
        openaiBaseURL: 'https://api.example.com/v1',
        modelName: 'gpt-4o',
        intent: 'default',
        timeout: 30_000,
      }),
      expect.objectContaining({
        abortSignal: expect.any(AbortSignal),
      }),
    );
  });

  it('returns config validation errors before invoking the AI caller', async () => {
    await expect(
      runConnectivityTest({
        apiKey: 'sk-test',
        baseUrl: '',
        model: 'gpt-4o',
      }),
    ).resolves.toEqual({
      ok: false,
      error: 'Missing required keys: OPENAI_BASE_URL',
    });
    expect(callAIWithStringResponse).not.toHaveBeenCalled();
  });

  it('maps aborts to the existing timeout error', async () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    vi.mocked(callAIWithStringResponse).mockRejectedValue(abortError as never);

    await expect(
      runConnectivityTest({
        apiKey: 'sk-test',
        baseUrl: 'https://api.example.com/v1',
        model: 'gpt-4o',
      }),
    ).resolves.toEqual({
      ok: false,
      error: 'Request timed out.',
    });
  });
});
