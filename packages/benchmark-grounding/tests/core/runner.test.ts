import { lstat, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { afterEach, beforeEach, describe, expect, it, rs } from '@rstest/core';
import { runBenchmark, runTestcase } from '../../src/core/runner';
import type { ModelCallConfig } from '../../src/core/schemas';
import { loadTestcases } from '../../src/core/testcase';
import { fixture } from '../fixture';

const mocks = rs.hoisted(() => ({
  locate: rs.fn(),
  destroy: rs.fn(),
  instances: [] as {
    device: {
      screenshotBase64: () => Promise<string>;
      size: () => Promise<{ width: number; height: number }>;
    };
    options: {
      modelConfig: Record<string, string>;
      screenshotShrinkFactor: number;
      onLLMUsage: (usage: Record<string, unknown>) => void;
      createOpenAIClient: (
        client: {
          withOptions: (options: {
            fetch: typeof fetch;
            maxRetries: number;
          }) => unknown;
        },
        options: Record<string, unknown>,
      ) => Promise<unknown>;
    };
  }[],
}));
rs.mock('@midscene/core', () => ({
  Agent: class {
    constructor(
      public device: (typeof mocks.instances)[number]['device'],
      public options: (typeof mocks.instances)[number]['options'],
    ) {
      mocks.instances.push(this);
    }
    aiLocate(prompt: string) {
      return mocks.locate(prompt, this);
    }
    destroy() {
      return mocks.destroy(this);
    }
  },
}));

const model: ModelCallConfig = {
  name: 'test-api-model',
  family: 'qwen3',
  displayName: 'Test model',
  baseUrl: 'https://private.example.com/v1',
  apiKey: 'secret-key-for-testing',
};
const directories: string[] = [];
async function outputRoot() {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'benchmark-grounding-run-'),
  );
  directories.push(directory);
  return directory;
}
async function readResult(
  directory: string,
  name = 'case-a',
  modelDirectory = 'Test_model',
) {
  return JSON.parse(
    await readFile(
      path.join(directory, 'results', modelDirectory, `${name}.json`),
      'utf8',
    ),
  );
}
async function observeRequest(
  agent: (typeof mocks.instances)[number],
  body: unknown,
  status = 200,
) {
  const response = new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
  const transport = rs.fn(async () => response);
  const wrapped = (await agent.options.createOpenAIClient(
    { withOptions: (options) => options },
    { fetch: transport },
  )) as { fetch: typeof fetch; maxRetries: number };
  expect(wrapped.maxRetries).toBe(0);
  const received = await wrapped.fetch('https://example.com/mock-request');
  expect(transport).toHaveBeenCalledTimes(1);
  expect(received).toBe(response);
  expect(await received.json()).toEqual(body);
}
beforeEach(() => {
  rs.clearAllMocks();
  mocks.instances.length = 0;
  mocks.locate.mockResolvedValue({ center: [0.5, 0.5] });
  mocks.destroy.mockResolvedValue(undefined);
});
afterEach(async () => {
  rs.restoreAllMocks();
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('runTestcase', () => {
  it('uses the selected instruction and captured image through an isolated model config', async () => {
    const testcase = fixture('case-a', { instructionLanguage: 'zh' });
    const expectedImage = Buffer.from(testcase.files['image.png']);
    const pending = runTestcase({
      testcase,
      model: { ...model, reasoningEnabled: 'default' },
    });
    testcase.testcase.instruction.zh = 'caller mutation';
    testcase.files['image.png'].fill(0);
    const result = await pending;
    expect(result.output).toMatchObject({
      type: 'POINT',
      correct: true,
      center: [0.5, 0.5],
    });
    expect(mocks.locate.mock.calls[0][0]).toBe('定位目标');
    expect(await mocks.instances[0].device.screenshotBase64()).toBe(
      `data:image/png;base64,${expectedImage.toString('base64')}`,
    );
    expect(mocks.instances[0].options.modelConfig).toMatchObject({
      MIDSCENE_MODEL_NAME: model.name,
      MIDSCENE_MODEL_API_KEY: model.apiKey,
      MIDSCENE_MODEL_RETRY_COUNT: '0',
      MIDSCENE_MODEL_REASONING_ENABLED: 'default',
    });
    expect(mocks.destroy).toHaveBeenCalledTimes(1);
    expect(result.profiling.usageStatus).toBe('missing');
    expect(result.profiling.calls).toBeUndefined();
  });

  it('counts GT edges as correct and rejects valid wrong points without execution errors', async () => {
    mocks.locate
      .mockResolvedValueOnce({ center: [1, 0] })
      .mockResolvedValueOnce({ center: [2, 0] });
    expect(
      (await runTestcase({ testcase: fixture(), model })).output.correct,
    ).toBe(true);
    expect(
      (await runTestcase({ testcase: fixture(), model })).output,
    ).toMatchObject({ type: 'POINT', correct: false });
  });

  it('owns its returned coordinates independently of the SDK response', async () => {
    const located = {
      center: [0.5, 0.5],
      rect: { left: 0, top: 0, width: 1, height: 1 },
    };
    mocks.locate.mockResolvedValue(located);
    const result = await runTestcase({ testcase: fixture(), model });
    located.center[0] = 10;
    located.rect.left = 10;
    expect(result.output.center).toEqual([0.5, 0.5]);
    expect(result.output.rect?.left).toBe(0);
  });

  it('recognizes explicit SDK not-found only, never arbitrary error messages', async () => {
    const refusal = Object.assign(new Error('Target absent'), {
      locateOutcome: 'not-found',
    });
    mocks.locate
      .mockRejectedValueOnce(refusal)
      .mockRejectedValueOnce(new Error('not-found'));
    expect(
      (
        await runTestcase({
          testcase: fixture('refusal', { groundTruth: 'REFUSAL' }),
          model,
        })
      ).output,
    ).toEqual({ type: 'REFUSAL', correct: true });
    expect(
      (
        await runTestcase({
          testcase: fixture('refusal', { groundTruth: 'REFUSAL' }),
          model,
        })
      ).output.type,
    ).toBe('ERROR');
  });

  it('restores Jev horizontal and vertical coordinates using their actual rounded sizes', async () => {
    const [record] = await loadTestcases({ names: ['WEB-v1-001'] });
    mocks.locate.mockResolvedValue({
      center: [100, 100],
      rect: { left: 10, top: 20, width: 30, height: 40 },
    });
    const result = await runTestcase({
      testcase: record,
      model: { ...model, family: 'jev' },
    });
    const instance = mocks.instances[0];
    const { width, height } = await instance.device.size();
    const shrink = Math.max(1, width / 1568, height / 1568);
    const scaleX = width / Math.round(width / shrink);
    const scaleY = height / Math.round(height / shrink);
    expect(instance.options.screenshotShrinkFactor).toBe(shrink);
    expect(result.output.center).toEqual([100 * scaleX, 100 * scaleY]);
    expect(result.output.rect).toEqual({
      left: 10 * scaleX,
      top: 20 * scaleY,
      width: 30 * scaleX,
      height: 40 * scaleY,
    });
  });

  it('returns at timeout while cleanup is pending and freezes late usage and outcomes', async () => {
    let finishCleanup: (() => void) | undefined;
    mocks.locate.mockImplementation(async (_prompt, agent) => {
      agent.options.onLLMUsage({
        prompt_tokens: 2,
        completion_tokens: 3,
        total_tokens: 5,
      });
      return { center: [0.5, 0.5] };
    });
    mocks.destroy.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishCleanup = resolve;
        }),
    );
    const result = await runTestcase({
      testcase: fixture(),
      model,
      timeoutMs: 20,
    });
    expect(result.output).toMatchObject({
      type: 'ERROR',
      error: { code: 'TIMEOUT' },
    });
    expect(result.profiling.durationMs).toBeGreaterThanOrEqual(20);
    expect(result.profiling).toMatchObject({
      usageStatus: 'partial',
      calls: 1,
      totalTokens: 5,
    });
    const frozen = JSON.stringify(result);
    mocks.instances[0].options.onLLMUsage({ total_tokens: 9999 });
    finishCleanup?.();
    await Promise.resolve();
    expect(JSON.stringify(result)).toBe(frozen);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.output)).toBe(true);
  });

  it('treats exactly timeoutMs as timeout even before the timer callback runs', async () => {
    let now = 0;
    rs.spyOn(performance, 'now').mockImplementation(() => now);
    mocks.locate.mockImplementation(async () => {
      now = 10;
      return { center: [0.5, 0.5] };
    });
    const result = await runTestcase({
      testcase: fixture(),
      model,
      timeoutMs: 10,
    });
    expect(result.profiling.durationMs).toBe(10);
    expect(result.output).toMatchObject({
      type: 'ERROR',
      error: { code: 'TIMEOUT' },
    });
  });

  it('handles late rejected model requests without overwriting timeout', async () => {
    let rejectRequest: ((reason: Error) => void) | undefined;
    mocks.locate.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectRequest = reject;
        }),
    );
    const result = await runTestcase({
      testcase: fixture(),
      model,
      timeoutMs: 10,
    });
    const frozen = JSON.stringify(result);
    rejectRequest?.(new Error('late provider failure'));
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(JSON.stringify(result)).toBe(frozen);
    expect(mocks.destroy).toHaveBeenCalledTimes(1);
  });

  it('records partial SDK usage honestly and redacts connection secrets from errors', async () => {
    mocks.locate.mockImplementation(async (_prompt, agent) => {
      agent.options.onLLMUsage({
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      });
      throw Object.assign(new Error(`401 ${model.apiKey} ${model.baseUrl}`), {
        status: 401,
      });
    });
    const result = await runTestcase({ testcase: fixture(), model });
    expect(result.profiling.usageStatus).toBe('partial');
    expect(result.profiling.usageNote).toContain(
      'completeness cannot be verified',
    );
    expect(result.output.error?.retryable).toBe(false);
    expect(JSON.stringify(result)).not.toContain(model.apiKey);
    expect(JSON.stringify(result)).not.toContain(model.baseUrl);
  });

  it.each([
    [
      { usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } },
      0,
      0,
      0,
    ],
    [
      {
        usage: {
          input_tokens: 10,
          output_tokens: 20,
          total_tokens: 30,
          input_tokens_details: { cached_tokens: 2 },
        },
      },
      10,
      20,
      30,
    ],
  ])(
    'observes raw Chat/Responses usage including true zero without consuming SDK responses',
    async (body, input, output, total) => {
      mocks.locate.mockImplementation(async (_prompt, agent) => {
        await observeRequest(agent, body);
        return { center: [0.5, 0.5] };
      });
      const result = await runTestcase({ testcase: fixture(), model });
      expect(result.profiling).toMatchObject({
        usageStatus: 'complete',
        calls: 1,
        totalPromptTokens: input,
        totalCompletionTokens: output,
        totalTokens: total,
      });
      expect(
        mocks.instances[0].options.modelConfig.MIDSCENE_MODEL_STREAM_MODE,
      ).toBe('non-stream');
    },
  );

  it('distinguishes incomplete raw usage from missing usage and counts every actual request', async () => {
    mocks.locate
      .mockImplementationOnce(async (_prompt, agent) => {
        await observeRequest(agent, { usage: { prompt_tokens: 4 } });
        await observeRequest(agent, {});
        return { center: [0.5, 0.5] };
      })
      .mockImplementationOnce(async (_prompt, agent) => {
        await observeRequest(agent, {});
        agent.options.onLLMUsage({
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
        });
        return { center: [0.5, 0.5] };
      });
    const partial = await runTestcase({ testcase: fixture(), model });
    expect(partial.profiling).toMatchObject({
      usageStatus: 'partial',
      calls: 2,
      totalPromptTokens: 4,
    });
    expect(partial.profiling.totalCompletionTokens).toBeUndefined();
    const missing = await runTestcase({ testcase: fixture(), model });
    expect(missing.profiling).toMatchObject({
      usageStatus: 'missing',
      calls: 1,
    });
    expect(missing.profiling.totalTokens).toBeUndefined();
  });

  it('uses observed HTTP auth status when SDK wrapping drops it', async () => {
    mocks.locate.mockImplementation(async (_prompt, agent) => {
      await observeRequest(agent, { error: 'invalid key' }, 401);
      throw new Error('SDK wrapped request failed');
    });
    const result = await runTestcase({ testcase: fixture(), model });
    expect(result.output.error?.retryable).toBe(false);
    expect(result.profiling).toMatchObject({
      calls: 1,
      usageStatus: 'missing',
    });
  });

  it('does not add raw response usage arriving after timeout', async () => {
    let finish: ((response: Response) => void) | undefined;
    mocks.locate.mockImplementation(async (_prompt, agent) => {
      const wrapped = (await agent.options.createOpenAIClient(
        { withOptions: (options: unknown) => options },
        {
          fetch: () =>
            new Promise<Response>((resolve) => {
              finish = resolve;
            }),
        },
      )) as { fetch: typeof fetch };
      await wrapped.fetch('https://example.com/mock-request');
      return { center: [0.5, 0.5] };
    });
    const result = await runTestcase({
      testcase: fixture(),
      model,
      timeoutMs: 15,
    });
    expect(result.profiling).toMatchObject({
      calls: 1,
      usageStatus: 'missing',
    });
    const saved = JSON.stringify(result);
    finish?.(
      new Response(
        JSON.stringify({
          usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
        }),
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(JSON.stringify(result)).toBe(saved);
  });

  it('retains verified Jev usage while missing usage and failed attempts remain unknown', async () => {
    mocks.locate.mockImplementation(async (_prompt, agent) => {
      agent.options.onLLMUsage({
        prompt_tokens: 0,
        completion_tokens: 2,
        total_tokens: 2,
      });
      return { center: [0.5, 0.5] };
    });
    const result = await runTestcase({
      testcase: fixture(),
      model: { ...model, family: 'jev' },
    });
    expect(result.profiling).toMatchObject({
      usageStatus: 'complete',
      calls: 1,
      totalPromptTokens: 0,
      totalCompletionTokens: 2,
    });
  });
});

describe('runBenchmark', () => {
  it('captures inputs before awaiting and writes only independent snapshots and results', async () => {
    const outputDirectory = await outputRoot();
    const record = fixture();
    const originalJson = Buffer.from(record.files['index.json']);
    const originalImage = Buffer.from(record.files['image.png']);
    const sha = record.testcaseSha256;
    const progress = rs.fn();
    const pending = runBenchmark({
      testcases: [record],
      models: [model],
      outputDirectory,
      onProgress: progress,
    });
    record.testcase.instruction.en = 'mutated after entry';
    record.testcase.groundTruth = 'REFUSAL';
    record.files['index.json'].fill(0);
    record.files['image.png'].fill(0);
    record.testcaseSha256 = '0'.repeat(64);
    const { directory } = await pending;
    expect(
      await readFile(path.join(directory, 'testcases/case-a/index.json')),
    ).toEqual(originalJson);
    expect(
      await readFile(path.join(directory, 'testcases/case-a/image.png')),
    ).toEqual(originalImage);
    const result = await readResult(directory);
    expect(result.output).toMatchObject({ type: 'POINT', correct: true });
    expect(result.consistency.testcaseSha256).toBe(sha);
    expect(result.input).toMatchObject({
      instruction: 'Locate the target',
      groundTruth: [0, 1, 1, 0],
      displayName: 'Test model',
    });
    expect((await readdir(directory)).sort()).toEqual([
      'meta.json',
      'results',
      'testcases',
    ]);
    for (const file of ['meta.json', 'results/Test_model/case-a.json']) {
      const contents = await readFile(path.join(directory, file), 'utf8');
      expect(contents).not.toContain(model.apiKey);
      expect(contents).not.toContain(model.baseUrl);
    }
    expect(progress).toHaveBeenCalledWith({
      completed: 1,
      total: 1,
      model: 'Test model',
      testcase: 'case-a',
      status: 'POINT',
      correct: true,
      profiling: result.profiling,
      attemptCount: 1,
    });
  });

  it('rejects parsed prompt, GT or SHA mismatches before any model call', async () => {
    for (const mismatch of ['prompt', 'gt', 'sha']) {
      const record = fixture();
      if (mismatch === 'prompt') record.testcase.instruction.en = 'altered';
      if (mismatch === 'gt') record.testcase.groundTruth = 'REFUSAL';
      if (mismatch === 'sha') record.testcaseSha256 = '0'.repeat(64);
      const outputDirectory = await outputRoot();
      await expect(
        runBenchmark({ testcases: [record], models: [model], outputDirectory }),
      ).rejects.toThrow();
      expect(await readdir(outputDirectory)).toEqual([]);
    }
    expect(mocks.locate).not.toHaveBeenCalled();
  });

  it('saves independent metadata and physical testcase files before the first request', async () => {
    const outputDirectory = await outputRoot();
    const models: ModelCallConfig[] = [
      {
        ...model,
        name: 'test-api-model-20261113',
        protocol: 'openai-chat',
        reasoningEnabled: false,
      },
      { ...model, name: 'second-api-model-20261114', displayName: 'No flags' },
    ];
    const meta = {
      models: {
        'Test model': {
          displayFamily: 'Captured family',
          name: 'wrong-version',
          family: 'wrong-family',
          displayName: 'wrong-display-name',
          protocol: 'openai-responses' as const,
          reasoningEnabled: true,
        },
        'No flags': {
          name: 'wrong-version',
          family: 'wrong-family',
          displayName: 'wrong-display-name',
          protocol: 'openai-responses' as const,
          reasoningEnabled: true,
        },
        Unused: { displayFamily: 'Unused family' },
      },
    };
    mocks.locate.mockImplementation(async () => {
      const [id] = await readdir(outputDirectory);
      const directory = path.join(outputDirectory, id);
      const metadata = JSON.parse(
        await readFile(path.join(directory, 'meta.json'), 'utf8'),
      );
      expect(metadata.models).toEqual({
        'Test model': {
          displayFamily: 'Captured family',
          name: 'test-api-model-20261113',
          family: model.family,
          displayName: 'Test model',
          protocol: 'openai-chat',
          reasoningEnabled: false,
        },
        'No flags': {
          name: 'second-api-model-20261114',
          family: model.family,
          displayName: 'No flags',
        },
      });
      expect(JSON.stringify(metadata)).not.toContain(model.apiKey);
      expect(JSON.stringify(metadata)).not.toContain(model.baseUrl);
      for (const filename of ['index.json', 'index.sha256', 'image.png']) {
        const stat = await lstat(
          path.join(directory, 'testcases/case-a', filename),
        );
        expect(stat.isSymbolicLink()).toBe(false);
        expect(stat.nlink).toBe(1);
      }
      return { center: [0.5, 0.5] };
    });
    const pending = runBenchmark({
      testcases: [fixture()],
      models,
      meta,
      outputDirectory,
    });
    meta.models['Test model'].displayFamily = 'Later mutation';
    models[0].name = 'Later model mutation';
    const { directory } = await pending;
    for (const name of ['Test_model', 'No_flags'])
      expect(
        (await readResult(directory, 'case-a', name)).output,
      ).toMatchObject({
        type: 'POINT',
        correct: true,
      });
  });

  it('refuses to overwrite an existing run directory', async () => {
    const outputDirectory = await outputRoot();
    rs.spyOn(Date, 'now').mockReturnValue(12345);
    const first = await runBenchmark({
      testcases: [fixture()],
      models: [model],
      outputDirectory,
    });
    await expect(
      runBenchmark({
        testcases: [fixture()],
        models: [model],
        outputDirectory,
      }),
    ).rejects.toThrow();
    expect(mocks.locate).toHaveBeenCalledTimes(1);
    expect((await readResult(first.directory)).output).toMatchObject({
      type: 'POINT',
      correct: true,
    });
  });

  it('sums complete raw usage across failed and successful attempts', async () => {
    const progress = rs.fn();
    mocks.locate
      .mockImplementationOnce(async (_prompt, agent) => {
        await observeRequest(agent, {
          usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
        });
        throw new Error('Model output parsing failed');
      })
      .mockImplementationOnce(async (_prompt, agent) => {
        await observeRequest(agent, {
          usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
        });
        return { center: [0.5, 0.5] };
      });
    const { directory } = await runBenchmark({
      testcases: [fixture()],
      models: [model],
      outputDirectory: await outputRoot(),
      onProgress: progress,
    });
    const result = await readResult(directory);
    expect(result.attempts).toHaveLength(2);
    expect(result.output).toMatchObject({ type: 'POINT', correct: true });
    expect(result.profiling).toMatchObject({
      usageStatus: 'complete',
      calls: 2,
      totalPromptTokens: 4,
      totalCompletionTokens: 6,
      totalTokens: 10,
    });
    expect(progress).toHaveBeenCalledTimes(1);
    expect(progress).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptCount: 2,
        profiling: result.profiling,
      }),
    );
  });

  it('isolates mutable progress profiling and redacted errors from saved results', async () => {
    mocks.locate.mockImplementation(async (_prompt, agent) => {
      await observeRequest(agent, {
        usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
      });
      throw Object.assign(
        new Error(
          `Request to ${model.baseUrl} failed with Bearer ${model.apiKey}`,
        ),
        { cause: { name: 'AuthenticationError', status: 401 } },
      );
    });
    const { directory } = await runBenchmark({
      testcases: [fixture()],
      models: [model],
      outputDirectory: await outputRoot(),
      onProgress: (progress) => {
        expect(progress.attemptCount).toBe(1);
        expect(progress.error?.message).toContain('[redacted]');
        expect(progress.error?.message).not.toContain(model.apiKey);
        expect(progress.error?.message).not.toContain(model.baseUrl);
        progress.profiling.durationMs = 999999;
        progress.profiling.totalTokens = 999999;
        progress.profiling.usageStatus = 'missing';
        if (progress.error) {
          progress.error.message = 'caller mutation';
          progress.error.retryable = true;
        }
      },
    });
    const result = await readResult(directory);
    expect(result.output.error).toMatchObject({
      message: 'Request to [redacted] failed with Bearer [redacted]',
      retryable: false,
    });
    expect(result.profiling).toMatchObject({
      usageStatus: 'complete',
      calls: 1,
      totalPromptTokens: 2,
      totalCompletionTokens: 3,
      totalTokens: 5,
    });
    expect(result.profiling.durationMs).not.toBe(999999);
    expect(result.attempts).toHaveLength(1);
  });

  it('retains every execution retry and its SDK usage, but never retries wrong answers or refusals', async () => {
    mocks.locate
      .mockImplementationOnce(async (_prompt, agent) => {
        agent.options.onLLMUsage({
          prompt_tokens: 1,
          completion_tokens: 2,
          total_tokens: 3,
        });
        throw new Error('output parsing failed');
      })
      .mockImplementationOnce(async (_prompt, agent) => {
        agent.options.onLLMUsage({
          prompt_tokens: 3,
          completion_tokens: 4,
          total_tokens: 7,
        });
        return { center: [2, 2] };
      })
      .mockRejectedValueOnce(
        Object.assign(new Error('absent'), { locateOutcome: 'not-found' }),
      );
    const { directory } = await runBenchmark({
      testcases: [fixture('case-a'), fixture('case-b')],
      models: [model],
      outputDirectory: await outputRoot(),
      concurrency: 1,
    });
    const a = await readResult(directory, 'case-a');
    const b = await readResult(directory, 'case-b');
    expect(mocks.locate).toHaveBeenCalledTimes(3);
    // The retry joins the same global queue after case-b's first attempt.
    expect(a.attempts).toHaveLength(2);
    expect(b.attempts).toHaveLength(1);
    expect(a.output.type).toBe('REFUSAL');
    expect(b.output).toMatchObject({ type: 'POINT', correct: false });
    expect(a.profiling.totalTokens).toBe(3);
    expect(b.profiling.totalTokens).toBe(7);
    expect(a.profiling.usageStatus).toBe('partial');
  });

  it('defaults to two retries for execution failures and skips deterministic authentication retries', async () => {
    mocks.locate.mockRejectedValue(new Error('temporary network failure'));
    const first = await runBenchmark({
      testcases: [fixture()],
      models: [model],
      outputDirectory: await outputRoot(),
    });
    expect((await readResult(first.directory)).attempts).toHaveLength(3);
    mocks.locate.mockClear();
    mocks.locate.mockRejectedValue(
      Object.assign(new Error('unauthorized'), {
        cause: { name: 'AuthenticationError', status: 401 },
      }),
    );
    const second = await runBenchmark({
      testcases: [fixture()],
      models: [model],
      outputDirectory: await outputRoot(),
    });
    expect((await readResult(second.directory)).attempts).toHaveLength(1);
    expect(mocks.locate).toHaveBeenCalledTimes(1);
  });

  it('limits global attempts across models and interleaves the models', async () => {
    let active = 0;
    let maxActive = 0;
    const order: string[] = [];
    const progress = rs.fn();
    const firstBatch: Promise<void> = new Promise((resolve) => {
      mocks.locate.mockImplementation(async (_prompt, agent) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        order.push(agent.options.modelConfig.MIDSCENE_MODEL_NAME);
        if (order.length === 2) resolve();
        // Concurrent image preparation may finish in either order. Hold both
        // attempts until the whole first batch has reached the model boundary.
        await firstBatch;
        active -= 1;
        return { center: [0.5, 0.5] };
      });
    });
    const { directory } = await runBenchmark({
      testcases: [fixture('a'), fixture('b'), fixture('c')],
      models: [model, { ...model, name: 'second', displayName: 'Second' }],
      outputDirectory: await outputRoot(),
      concurrency: 2,
      onProgress: progress,
    });
    expect(maxActive).toBe(2);
    expect(order.slice(0, 2).sort()).toEqual([model.name, 'second'].sort());
    expect(progress.mock.calls.map(([event]) => event.completed)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
    expect(progress).toHaveBeenLastCalledWith(
      expect.objectContaining({ completed: 6, total: 6 }),
    );
    for (const name of ['Test_model', 'Second'])
      expect(await readdir(path.join(directory, 'results', name))).toHaveLength(
        3,
      );
    expect(
      mocks.instances.map(
        (instance) => instance.options.modelConfig.MIDSCENE_MODEL_API_KEY,
      ),
    ).toEqual(Array(6).fill(model.apiKey));
  });

  it('releases queue slots at timeout without waiting for unresolved requests', async () => {
    const started: number[] = [];
    mocks.locate.mockImplementation(() => {
      started.push(performance.now());
      return new Promise(() => {});
    });
    const { directory } = await runBenchmark({
      testcases: [fixture('a'), fixture('b')],
      models: [model],
      outputDirectory: await outputRoot(),
      concurrency: 1,
      retries: 0,
      timeoutMs: 15,
    });
    expect(started).toHaveLength(2);
    expect((await readResult(directory, 'a')).output.error.code).toBe(
      'TIMEOUT',
    );
    expect((await readResult(directory, 'b')).output.error.code).toBe(
      'TIMEOUT',
    );
  });

  it('rejects duplicate identities and output directory collisions', async () => {
    const outputDirectory = await outputRoot();
    await expect(
      runBenchmark({
        testcases: [fixture()],
        models: [model, model],
        outputDirectory,
      }),
    ).rejects.toThrow('displayName');
    await expect(
      runBenchmark({
        testcases: [fixture()],
        models: [
          { ...model, displayName: 'a b' },
          { ...model, displayName: 'a?b' },
        ],
        outputDirectory,
      }),
    ).rejects.toThrow('collision');
    await expect(
      runBenchmark({
        testcases: [fixture(), fixture()],
        models: [model],
        outputDirectory,
      }),
    ).rejects.toThrow('Duplicate testcase');
    expect(mocks.locate).not.toHaveBeenCalled();
  });

  it('rejects model directories differing only by case before writing or calling a model', async () => {
    const outputDirectory = await outputRoot();
    await expect(
      runBenchmark({
        testcases: [fixture()],
        models: [
          { ...model, displayName: 'Foo' },
          { ...model, displayName: 'foo' },
        ],
        outputDirectory,
      }),
    ).rejects.toThrow('Model output directory collision (case-insensitive)');
    expect(await readdir(outputDirectory)).toEqual([]);
    expect(mocks.locate).not.toHaveBeenCalled();
  });

  it('rejects testcase snapshot directories differing only by case before writing or calling a model', async () => {
    const outputDirectory = await outputRoot();
    await expect(
      runBenchmark({
        testcases: [fixture('Foo'), fixture('foo')],
        models: [model],
        outputDirectory,
      }),
    ).rejects.toThrow(
      'Testcase snapshot directory collision (case-insensitive)',
    );
    expect(await readdir(outputDirectory)).toEqual([]);
    expect(mocks.locate).not.toHaveBeenCalled();
  });
});
