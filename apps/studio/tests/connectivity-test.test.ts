import { beforeEach, describe, expect, it, rs } from '@rstest/core';

rs.mock('@midscene/core/ai-model', () => ({
  runConnectivityTest: rs.fn(),
}));

import { runConnectivityTest as runCoreConnectivityTest } from '@midscene/core/ai-model';
import { runConnectivityTest } from '../src/main/playground/connectivity-test';

describe('runConnectivityTest', () => {
  beforeEach(() => {
    rs.clearAllMocks();
  });

  it('runs the Studio model config through the core connectivity suite', async () => {
    rs.mocked(runCoreConnectivityTest).mockResolvedValue({
      passed: true,
      checks: [],
      requestCount: 0,
    });

    const result = await runConnectivityTest({
      MIDSCENE_MODEL_API_KEY: 'sk-test',
      MIDSCENE_MODEL_BASE_URL: 'https://api.example.com/v1',
      MIDSCENE_MODEL_NAME: 'gpt-4o',
      MIDSCENE_MODEL_FAMILY: 'gpt-5',
    });

    expect(result).toEqual({
      passed: true,
      checks: [],
      requestCount: 0,
    });
    expect(runCoreConnectivityTest).toHaveBeenCalledWith({
      defaultModelConfig: expect.objectContaining({
        openaiApiKey: 'sk-test',
        openaiBaseURL: 'https://api.example.com/v1',
        modelName: 'gpt-4o',
        modelFamily: 'gpt-5',
        intent: 'default',
        slot: 'default',
      }),
      locateModelConfig: expect.objectContaining({
        modelName: 'gpt-4o',
        intent: 'locate',
        slot: 'default',
      }),
      planningModelConfig: expect.objectContaining({
        openaiApiKey: 'sk-test',
        openaiBaseURL: 'https://api.example.com/v1',
        modelName: 'gpt-4o',
        modelFamily: 'gpt-5',
        intent: 'planning',
        slot: 'default',
      }),
      insightModelConfig: expect.objectContaining({
        openaiApiKey: 'sk-test',
        openaiBaseURL: 'https://api.example.com/v1',
        modelName: 'gpt-4o',
        modelFamily: 'gpt-5',
        intent: 'insight',
        slot: 'default',
      }),
    });
  });

  it('supports compatible alias keys when building the core config', async () => {
    rs.mocked(runCoreConnectivityTest).mockResolvedValue({
      passed: true,
      checks: [],
      requestCount: 0,
    });

    await runConnectivityTest({
      OPENAI_API_KEY: 'sk-test',
      OPENAI_BASE_URL: 'https://api.example.com/v1',
      MIDSCENE_MODEL: 'gpt-4o',
    });

    expect(runCoreConnectivityTest).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultModelConfig: expect.objectContaining({
          openaiApiKey: 'sk-test',
          openaiBaseURL: 'https://api.example.com/v1',
          modelName: 'gpt-4o',
        }),
      }),
    );
  });

  it('returns config validation errors before invoking the core suite', async () => {
    await expect(
      runConnectivityTest({
        MIDSCENE_MODEL_API_KEY: 'sk-test',
        MIDSCENE_MODEL_BASE_URL: '',
        MIDSCENE_MODEL_NAME: 'gpt-4o',
      }),
    ).resolves.toMatchObject({
      passed: false,
      checks: [],
      requestCount: 0,
      message: 'Missing required keys: OPENAI_BASE_URL',
    });
    expect(runCoreConnectivityTest).not.toHaveBeenCalled();
  });
});
