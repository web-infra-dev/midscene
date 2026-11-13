import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { type AIUsageInfo, Agent, getVersion } from '@midscene/core';
import { encodedImageInfoOfBuffer } from '@midscene/shared/img';
import { deepFreeze, pick, sortBy, sum, sumBy } from 'es-toolkit';
import PQueue from 'p-queue';
import pRetry, { AbortError } from 'p-retry';
import { version } from '../../package.json';
import { mergeReportMeta } from './metadata';
import {
  type AttemptResult,
  type LoadedTestcase,
  type ModelCallConfig,
  type Profile,
  type ReportMeta,
  type Result,
  type RunManifest,
  type RunSummary,
  modelCallConfigSchema,
  outputSchema,
  resultSchema,
  runSchema,
} from './schemas';
import { calculateSummary } from './summary';
import {
  cloneLoadedTestcases,
  imageFilename,
  validateLoadedTestcase,
} from './testcase';

type Output = AttemptResult['output'];
const usageNote =
  'SDK normalizes missing provider usage fields to zero. Reported usage and calls may be partial; completeness cannot be verified.';
type ObservedCall = {
  input?: number;
  output?: number;
  total?: number;
  cached?: number;
  durationMs?: number;
  status?: number;
};
const validCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

function usageProfile(
  usages: AIUsageInfo[],
  calls: ObservedCall[],
  durationMs: number,
  family: ModelCallConfig['family'],
  output: Output,
): Profile {
  const observed = calls.length > 0;
  const samples: ObservedCall[] = observed
    ? calls
    : usages.map((usage) => ({
        input: usage.prompt_tokens,
        output: usage.completion_tokens,
        total: usage.total_tokens,
        cached: usage.cached_input,
        durationMs: usage.time_cost,
      }));
  if (!samples.length) return { durationMs, usageStatus: 'missing' };
  // System One validates input/output usage; other SDK callbacks may hide missing fields.
  const complete =
    (observed || (family === 'jev' && output.type !== 'ERROR')) &&
    samples.every(
      (sample) =>
        validCount(sample.input) &&
        validCount(sample.output) &&
        validCount(sample.total),
    );
  const hasUsage = samples.some(
    (sample) =>
      validCount(sample.input) ||
      validCount(sample.output) ||
      validCount(sample.total),
  );
  const profiling: Profile = {
    durationMs,
    calls: samples.length,
    usageStatus: complete
      ? 'complete'
      : observed && !hasUsage
        ? 'missing'
        : 'partial',
  };
  const fields = {
    totalPromptTokens: 'input',
    totalCompletionTokens: 'output',
    totalTokens: 'total',
    totalCachedInput: 'cached',
    totalTimeCostMs: 'durationMs',
  } as const;
  for (const [target, source] of Object.entries(fields)) {
    const values = samples.map((sample) => sample[source]).filter(validCount);
    if (values.length) profiling[target as keyof typeof fields] = sum(values);
  }
  if (!complete)
    profiling.usageNote = observed
      ? 'One or more observed requests did not provide complete token usage. Known values are partial totals.'
      : usageNote;
  return profiling;
}

function errorOutput(
  error: unknown,
  model: ModelCallConfig,
  httpStatus?: number,
): Output {
  const details =
    error && typeof error === 'object'
      ? (error as Record<string, unknown>)
      : {};
  const chain: Record<string, unknown>[] = [];
  let cursor: unknown = details;
  while (cursor && typeof cursor === 'object' && chain.length < 6) {
    chain.push(cursor as Record<string, unknown>);
    cursor = (cursor as Record<string, unknown>).cause;
  }
  const code = chain
    .map((item) => item.code)
    .find((value) => typeof value === 'string');
  const status =
    httpStatus ??
    chain
      .map((item) => item.status)
      .find((value) => typeof value === 'number') ??
    Number(
      chain
        .map((item) => String(item.message ?? ''))
        .join(' ')
        .match(/Jev request failed \((\d{3})\)/)?.[1],
    );
  const deterministic =
    (typeof status === 'number' &&
      [400, 401, 403, 404, 405, 422].includes(status)) ||
    chain.some((item) =>
      /authentication|permission|invalid_api_key|invalid_parameter|unsupported_model|model_not_found/i.test(
        `${item.name ?? ''} ${item.code ?? ''}`,
      ),
    );
  // Error messages may include provider request details; retain a bounded diagnostic only.
  const message = [model.apiKey, model.baseUrl]
    .filter(Boolean)
    .reduce(
      (message, secret) => message.split(secret).join('[redacted]'),
      error instanceof Error ? error.message : String(error),
    )
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .slice(0, 2000);
  return {
    type: 'ERROR',
    correct: false,
    error: {
      name: typeof details.name === 'string' ? details.name : 'Error',
      message: message || 'Model execution failed',
      ...(typeof code === 'string' ? { code } : {}),
      retryable: !deterministic,
    },
  };
}

export async function runTestcase({
  testcase: supplied,
  model: suppliedModel,
  timeoutMs = 60_000,
}: {
  testcase: LoadedTestcase;
  model: ModelCallConfig;
  timeoutMs?: number;
}): Promise<AttemptResult> {
  const startedAt = performance.now();
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
    throw new Error('timeoutMs must be positive and finite');
  const captured = cloneLoadedTestcases([supplied])[0];
  const model = modelCallConfigSchema.parse(suppliedModel);
  const usages: AIUsageInfo[] = [];
  const calls: ObservedCall[] = [];
  let validated = false;
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutOutput: Output = {
    type: 'ERROR',
    correct: false,
    error: {
      name: 'TimeoutError',
      code: 'TIMEOUT',
      message: `Attempt exceeded timeoutMs (${timeoutMs}ms)`,
      retryable: true,
    },
  };
  const timeout = new Promise<undefined>((resolve) => {
    const check = () => {
      const remaining = timeoutMs - (performance.now() - startedAt);
      if (remaining <= 0) resolve(undefined);
      else timer = setTimeout(check, Math.ceil(remaining));
    };
    check();
  });
  // Both branches resolve, so a rejection arriving after timeout is always handled.
  const work = (async (): Promise<Output> => {
    const record = await validateLoadedTestcase(captured);
    validated = true;
    if (settled || performance.now() - startedAt >= timeoutMs)
      return timeoutOutput;
    const { testcase } = record;
    const image = record.files[imageFilename(testcase)];
    const { width, height } = encodedImageInfoOfBuffer(image);
    const shrink =
      model.family === 'jev' ? Math.max(1, width / 1568, height / 1568) : 1;
    const agent = new Agent(
      {
        interfaceType: 'static',
        actionSpace: () => [],
        screenshotBase64: async () =>
          `data:image/${testcase.reference.image.format};base64,${image.toString('base64')}`,
        size: async () => ({ width, height }),
      },
      {
        generateReport: false,
        screenshotShrinkFactor: shrink,
        modelConfig: {
          MIDSCENE_MODEL_BASE_URL: model.baseUrl,
          MIDSCENE_MODEL_API_KEY: model.apiKey,
          MIDSCENE_MODEL_FAMILY: model.family,
          MIDSCENE_MODEL_NAME: model.name,
          MIDSCENE_MODEL_RETRY_COUNT: '0',
          MIDSCENE_MODEL_STREAM_MODE: 'non-stream',
          ...(model.protocol
            ? { MIDSCENE_MODEL_PROTOCOL: model.protocol }
            : {}),
          ...(model.reasoningEnabled !== undefined
            ? {
                MIDSCENE_MODEL_REASONING_ENABLED: String(
                  model.reasoningEnabled,
                ),
              }
            : {}),
        },
        onLLMUsage: (usage) => {
          if (!settled) usages.push(structuredClone(usage));
        },
        createOpenAIClient: async (client, options) => {
          const transport = options.fetch as typeof fetch;
          if (typeof transport !== 'function')
            throw new Error('SDK did not provide its request transport');
          return client.withOptions({
            maxRetries: 0,
            fetch: async (
              input: Parameters<typeof fetch>[0],
              init: Parameters<typeof fetch>[1],
            ) => {
              const call: ObservedCall = {};
              const requestStarted = performance.now();
              if (!settled) calls.push(call);
              const response = await transport(input, init);
              if (!settled) call.status = response.status;
              try {
                const body: unknown = await response.clone().json();
                if (
                  !settled &&
                  body &&
                  typeof body === 'object' &&
                  'usage' in body &&
                  body.usage &&
                  typeof body.usage === 'object'
                ) {
                  const usage = body.usage as Record<string, unknown>;
                  const input = usage.prompt_tokens ?? usage.input_tokens;
                  const output = usage.completion_tokens ?? usage.output_tokens;
                  if (validCount(input)) call.input = input;
                  if (validCount(output)) call.output = output;
                  if (validCount(usage.total_tokens))
                    call.total = usage.total_tokens;
                  const details =
                    usage.prompt_tokens_details ?? usage.input_tokens_details;
                  if (
                    details &&
                    typeof details === 'object' &&
                    'cached_tokens' in details &&
                    validCount(details.cached_tokens)
                  )
                    call.cached = details.cached_tokens;
                }
              } catch {
                // The SDK owns response parsing; lack of readable usage is recorded as unknown.
              }
              if (!settled)
                call.durationMs = performance.now() - requestStarted;
              return response;
            },
          });
        },
      },
    );
    try {
      const located = await agent.aiLocate(
        testcase.instruction[testcase.instructionLanguage],
      );
      const scaleX = width / Math.round(width / shrink);
      const scaleY = height / Math.round(height / shrink);
      if (
        !located.center ||
        located.center.some((value) => !Number.isFinite(value))
      ) {
        throw new Error('Model returned an invalid locate point');
      }
      const center: [number, number] = [
        located.center[0] * scaleX,
        located.center[1] * scaleY,
      ];
      const gt = testcase.groundTruth;
      return outputSchema.parse({
        type: 'POINT',
        center,
        correct:
          gt !== 'REFUSAL' &&
          center[0] >= gt[3] &&
          center[0] <= gt[1] &&
          center[1] >= gt[0] &&
          center[1] <= gt[2],
        ...(located.rect
          ? {
              rect: {
                left: located.rect.left * scaleX,
                top: located.rect.top * scaleY,
                width: located.rect.width * scaleX,
                height: located.rect.height * scaleY,
              },
            }
          : {}),
        ...(located.dpr !== undefined ? { dpr: located.dpr } : {}),
      });
    } catch (error) {
      // TaskExecutionError exposes this only for an explicitly parsed absent target.
      if (
        error &&
        typeof error === 'object' &&
        'locateOutcome' in error &&
        error.locateOutcome === 'not-found'
      ) {
        return {
          type: 'REFUSAL',
          correct: testcase.groundTruth === 'REFUSAL',
        };
      }
      throw error;
    } finally {
      await agent.destroy();
    }
  })().catch((error) => {
    const output = errorOutput(error, model, calls[calls.length - 1]?.status);
    if (!validated && output.error) output.error.retryable = false;
    return output;
  });
  const output = await Promise.race([work, timeout]);
  const durationMs = performance.now() - startedAt;
  settled = true;
  clearTimeout(timer);
  const finalOutput: Output =
    !output || durationMs >= timeoutMs ? timeoutOutput : output;
  return deepFreeze({
    output: finalOutput,
    profiling: usageProfile(
      usages,
      calls,
      durationMs,
      model.family,
      finalOutput,
    ),
  });
}

function aggregateProfiles(attempts: AttemptResult[]): Profile {
  const profile: Profile = {
    durationMs: sumBy(attempts, (attempt) => attempt.profiling.durationMs),
    usageStatus: attempts.every(
      (attempt) => attempt.profiling.usageStatus === 'complete',
    )
      ? 'complete'
      : attempts.every((attempt) => attempt.profiling.usageStatus === 'missing')
        ? 'missing'
        : 'partial',
  };
  for (const key of [
    'totalPromptTokens',
    'totalCompletionTokens',
    'totalTokens',
    'totalCachedInput',
    'totalTimeCostMs',
    'calls',
  ] as const) {
    const values = attempts.flatMap((attempt) =>
      attempt.profiling[key] === undefined ? [] : [attempt.profiling[key]],
    );
    if (values.length) profile[key] = sum(values);
  }
  if (profile.usageStatus === 'partial') profile.usageNote = usageNote;
  return profile;
}

export type BenchmarkProgress = {
  completed: number;
  total: number;
  model: string;
  testcase: string;
  status: Output['type'];
  correct: boolean;
};

export async function runBenchmark({
  testcases: supplied,
  models: suppliedModels,
  meta: suppliedMeta,
  outputDirectory,
  concurrency = 32,
  retries = 2,
  timeoutMs = 60_000,
  onProgress,
}: {
  testcases: LoadedTestcase[];
  models: ModelCallConfig[];
  meta?: ReportMeta;
  outputDirectory: string;
  concurrency?: number;
  retries?: number;
  timeoutMs?: number;
  onProgress?: (progress: BenchmarkProgress) => void;
}): Promise<{ directory: string; summary: RunSummary }> {
  // Capture every caller-owned reference before the first asynchronous boundary.
  const captured = cloneLoadedTestcases(supplied);
  const models = suppliedModels.map((model) => {
    const parsed = modelCallConfigSchema.parse(model);
    const displayName = parsed.displayName ?? parsed.name;
    const directory = displayName.replace(/^\.+$|[^a-zA-Z0-9._-]/g, '_');
    return { ...parsed, displayName, directory };
  });
  const meta =
    suppliedMeta === undefined ? undefined : structuredClone(suppliedMeta);
  if (!models.length) throw new Error('At least one model is required');
  if (new Set(models.map((model) => model.displayName)).size !== models.length)
    throw new Error('Duplicate model displayName');
  if (
    new Set(models.map((model) => model.directory.toLowerCase())).size !==
    models.length
  )
    throw new Error('Model output directory collision (case-insensitive)');
  if (typeof outputDirectory !== 'string' || !outputDirectory)
    throw new Error('outputDirectory is required');
  const options = runSchema.shape.options.parse({
    concurrency,
    retries,
    timeoutMs,
  });
  const [testcases, metadata] = await Promise.all([
    Promise.all(captured.map((record) => validateLoadedTestcase(record))).then(
      (records) => sortBy(records, [(record) => record.testcase.name]),
    ),
    mergeReportMeta(meta),
  ]);
  if (
    new Set(testcases.map((record) => record.testcase.name)).size !==
    testcases.length
  )
    throw new Error('Duplicate testcase names');
  if (
    new Set(testcases.map((record) => record.testcase.name.toLowerCase()))
      .size !== testcases.length
  )
    throw new Error('Testcase snapshot directory collision (case-insensitive)');
  const startedAt = new Date().toISOString();
  const id = String(Date.now());
  const directory = path.resolve(outputDirectory, id);
  const tasks = testcases.flatMap((record) =>
    models.map(({ directory: modelDirectory, ...model }) => ({
      model,
      modelDirectory,
      record,
    })),
  );
  const run: RunManifest = {
    schemaVersion: 1,
    id,
    startedAt,
    status: 'running',
    planned: tasks.length,
    completed: 0,
    versions: { package: version, sdk: getVersion() },
    options,
    models: models.map((model) =>
      pick(model, [
        'name',
        'family',
        'displayName',
        'directory',
        'protocol',
        'reasoningEnabled',
      ]),
    ),
    testcases: testcases.map((record) => ({
      name: record.testcase.name,
      testcaseSha256: record.testcaseSha256,
    })),
    tasks: tasks.map(({ model, record }) => ({
      model: model.displayName,
      testcase: record.testcase.name,
    })),
  };
  const writeJson = (filename: string, value: unknown) =>
    writeFile(
      path.join(directory, filename),
      `${JSON.stringify(value, null, 2)}\n`,
    );
  await mkdir(path.resolve(outputDirectory), { recursive: true });
  await mkdir(directory);
  await Promise.all(
    testcases.map(async (record) => {
      const target = path.join(directory, 'testcases', record.testcase.name);
      await mkdir(target, { recursive: true });
      await Promise.all(
        Object.entries(record.files).map(([filename, bytes]) =>
          writeFile(path.join(target, filename), bytes),
        ),
      );
    }),
  );
  await writeJson('meta.json', metadata);
  await writeJson('run.json', run);
  await Promise.all(
    models.map((model) =>
      mkdir(path.join(directory, 'results', model.directory), {
        recursive: true,
      }),
    ),
  );
  const results: Result[] = [];
  const queue = new PQueue({ concurrency });
  let progressWrite = Promise.resolve();
  const pending = tasks.map(async ({ model, modelDirectory, record }) => {
    const attempts: AttemptResult[] = [];
    try {
      await pRetry(
        async () => {
          const attempt = await queue.add(() =>
            runTestcase({
              testcase: record,
              model,
              timeoutMs,
            }),
          );
          if (!attempt) throw new Error('Queue returned no attempt');
          attempts.push(attempt);
          if (attempt.output.type === 'ERROR') {
            const error = new Error(
              attempt.output.error?.message ?? 'Execution failed',
            );
            if (!attempt.output.error?.retryable) throw new AbortError(error);
            throw error;
          }
        },
        { retries, minTimeout: 0 },
      );
    } catch (error) {
      if (!attempts.length) throw error;
    }
    const result = resultSchema.parse({
      schemaVersion: 1,
      consistency: { testcaseSha256: record.testcaseSha256 },
      input: {
        testcase: record.testcase.name,
        model: model.name,
        family: model.family,
        displayName: model.displayName,
        platform: record.testcase.platform,
        instruction:
          record.testcase.instruction[record.testcase.instructionLanguage],
        groundTruth: record.testcase.groundTruth,
      },
      output: attempts[attempts.length - 1].output,
      profiling: aggregateProfiles(attempts),
      attempts,
    });
    await writeJson(
      path.join('results', modelDirectory, `${record.testcase.name}.json`),
      result,
    );
    results.push(result);
    progressWrite = progressWrite.then(async () => {
      run.completed += 1;
      await writeJson('run.json', run);
      onProgress?.({
        completed: run.completed,
        total: run.planned,
        model: model.displayName,
        testcase: record.testcase.name,
        status: result.output.type,
        correct: result.output.correct,
      });
    });
    await progressWrite;
  });
  try {
    const settled = await Promise.allSettled(pending);
    const failed = settled.find((result) => result.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;
    run.status = 'completed';
    run.endedAt = new Date().toISOString();
    const summary = calculateSummary({
      run,
      results,
      meta: metadata,
    });
    await writeJson('summary.json', summary);
    await writeJson('run.json', run);
    return { directory, summary };
  } catch (error) {
    run.status = 'interrupted';
    run.endedAt = new Date().toISOString();
    await writeJson('run.json', run);
    throw error;
  }
}
