import type { Agent } from '@midscene/core';
import type { IModelConfig } from '@midscene/shared/env';
import { beforeEach, expect, it, rs } from '@rstest/core';
import { withReplay } from '../src/index';
import { createReplayJev } from '../src/runtime/jev';

const { call, runtime, prepared } = rs.hoisted(() => ({
  prepared: {
    imageBase64: 'data:image/png;base64,Ag==',
    preparation: {
      originalSize: { width: 100, height: 100 },
      contentSize: { width: 100, height: 100 },
      preparedSize: { width: 280, height: 280 },
    },
  },
  call: rs.fn(),
  runtime: rs.fn((config: unknown) => ({ config })),
}));
rs.mock('@midscene/core/ai-model', () => ({
  callSystemOneAI: call,
  getModelRuntime: runtime,
  prepareJevImage: async () => prepared,
}));
beforeEach(() => {
  call.mockReset().mockResolvedValue({
    content: JSON.stringify({
      answers: {
        evidence_sufficient: { type: 'noul', noul: 0.99 },
        loading: { type: 'noul', noul: 0 },
        state_matches: { type: 'noul', noul: 0.99 },
      },
    }),
  });
  runtime.mockClear();
});
function fixture(overrides: Partial<IModelConfig> = {}) {
  const config = {
    intent: 'insight',
    slot: 'default',
    modelName: 'general-model',
    modelFamily: 'qwen3-vl',
    openaiBaseURL: 'https://openrouter.ai/api/v1',
    openaiApiKey: 'host-only-credential',
    ...overrides,
  } as IModelConfig;
  const agent = {
    modelConfigManager: { getModelConfig: rs.fn(() => config) },
    aiBoolean: rs.fn(),
    recordToReport: rs.fn(async () => undefined),
    interface: { screenshotBase64: rs.fn(async () => 'YQ==') },
  };
  return { agent, config, replay: withReplay(agent as unknown as Agent) };
}
it('uses host OpenRouter credentials for dedicated Jev checks, without aiBoolean', async () => {
  const { agent, replay, config } = fixture();
  await expect(replay.verify('ready')).resolves.toMatchObject({
    state: 'pass',
    judge: { model: 'typesafe/jev-1.14' },
  });
  await replay.verify('still ready');
  expect(runtime).toHaveBeenCalledTimes(1);
  expect(runtime).toHaveBeenCalledWith({
    ...config,
    intent: 'insight',
    slot: 'insight',
    modelName: 'typesafe/jev-1.14',
    modelFamily: 'jev',
    modelDescription: 'Replay Jev 1.14',
    protocol: 'openai-chat',
    extraBody: undefined,
  });
  expect(agent.recordToReport).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({
      screenshots: [{ base64: prepared.imageBase64 }],
    }),
  );
  expect(call).toHaveBeenCalledTimes(2);
  expect(agent.aiBoolean).not.toHaveBeenCalled();
});
it('preserves an explicit host Jev configuration', async () => {
  const { config, replay } = fixture({
    slot: 'insight',
    modelFamily: 'jev',
    modelName: 'host-jev',
    openaiBaseURL: 'https://host.example/v1',
  });
  await replay.verify('ready');
  expect(runtime).toHaveBeenCalledWith(config);
});
for (const overrides of [
  { openaiBaseURL: 'https://host.example/v1' },
  { slot: 'insight' as const },
])
  it(`rejects unavailable Jev without environment or general-model fallback: ${JSON.stringify(overrides)}`, async () => {
    const { agent, replay } = fixture(overrides);
    await expect(replay.verify('ready')).rejects.toMatchObject({
      code: 'REPLAY_JEV_REQUIRED',
    });
    expect(call).not.toHaveBeenCalled();
    expect(agent.aiBoolean).not.toHaveBeenCalled();
    expect(agent.interface.screenshotBase64).not.toHaveBeenCalled();
  });

for (const [name, evidence, loading, matches, code] of [
  ['visible mismatch', 0.99, 0, 0.05, 'VERIFY_FAIL'],
  ['loading', 0.99, 0.99, 0.1, 'VERIFY_PENDING'],
  ['uncertain match', 0.99, 0, 0.85, 'VERIFY_INCONCLUSIVE'],
  ['insufficient evidence', 0.7, 0, 0.99, 'VERIFY_INCONCLUSIVE'],
  ['invalid probability', 0.99, 0, 1.1, 'JEV_INVALID_RESPONSE'],
] as const) {
  it(`keeps ${name} from passing the real Jev verdict mapping`, async () => {
    call.mockResolvedValueOnce({
      content: JSON.stringify({
        answers: {
          evidence_sufficient: { type: 'noul', noul: evidence },
          loading: { type: 'noul', noul: loading },
          state_matches: { type: 'noul', noul: matches },
        },
      }),
    });
    const { replay, agent } = fixture();
    await expect(replay.verify('ready')).rejects.toMatchObject({ code });
    expect(call).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledWith(
      expect.objectContaining({
        state: expect.objectContaining({ criterion: 'ready' }),
        images: { current_image: prepared.imageBase64 },
        questions: expect.any(Object),
      }),
      expect.any(Object),
      expect.any(Object),
    );
    expect(agent.aiBoolean).not.toHaveBeenCalled();
  });
}

for (const [status, category, attempts] of [
  [400, 'invalid-input', 1],
  [401, 'authentication', 1],
  [429, 'transport', 2],
  [503, 'transport', 2],
] as const) {
  it(`distinguishes HTTP ${status} from a verdict and only retries transport`, async () => {
    call.mockRejectedValue(
      Object.assign(new Error(`HTTP ${status}`), { status }),
    );
    const { config } = fixture({ modelFamily: 'jev' });
    const checker = await createReplayJev(config, 1);
    await expect(
      checker.judge({
        criterion: 'ready',
        frames: [{ base64: 'data:image/png;base64,AQ==' }],
      }),
    ).rejects.toMatchObject({
      category,
      details: { status, attempts },
      next: expect.any(String),
      evaluatedImage: prepared.imageBase64,
      preparation: prepared.preparation,
    });
    expect(call).toHaveBeenCalledTimes(attempts);
  });
}
it('keeps invalid responses and provider failures out of inconclusive verdicts and reports them', async () => {
  const { replay, agent } = fixture();
  call.mockResolvedValueOnce({ content: '{broken' });
  await expect(replay.verify('ready')).rejects.toMatchObject({
    code: 'JEV_INVALID_RESPONSE',
    category: 'invalid-response',
  });
  const report = JSON.parse(
    (
      agent.recordToReport.mock.calls[0] as unknown as [
        string,
        { content: string },
      ]
    )[1].content,
  );
  expect(report.error).toMatchObject({ code: 'JEV_INVALID_RESPONSE' });
  expect(report.verdict).toBeUndefined();
  expect(call).toHaveBeenCalledTimes(1);
});
