import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import * as actual from 'node:fs/promises' with { rstest: 'importActual' };
import os from 'node:os';
import path from 'node:path';
import {
  createReport,
  mergeReports,
} from '@/benchmark-grounding/core/reporter';
import type {
  LoadedTestcase,
  ReportMeta,
  Result,
} from '@/benchmark-grounding/core/schemas';
import { afterEach, describe, expect, it, rs } from '@rstest/core';
import { fixture as testcase, writeFixture } from '../fixture';

rs.mock('node:fs/promises', () => ({
  ...actual,
  readFile: (filename: string | URL, options?: 'utf8') => {
    if (
      filename instanceof URL &&
      filename.pathname.endsWith('/ui-template.html')
    )
      return Promise.resolve(
        '<!doctype html><script id="benchmark-data" type="application/json">"__MIDSCENE_BENCHMARK_DATA__"</script>',
      );
    return options === 'utf8'
      ? actual.readFile(filename, 'utf8')
      : actual.readFile(filename);
  },
}));

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporary
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

function result(record: LoadedTestcase, model = 'model'): Result {
  const attempt: Result['attempts'][number] = {
    output: { type: 'POINT', correct: true, center: [0.5, 0.5] },
    profiling: {
      durationMs: 100,
      calls: 1,
      usageStatus: 'complete',
      totalPromptTokens: 10,
      totalCompletionTokens: 2,
      totalTokens: 12,
    },
  };
  return {
    schemaVersion: 1,
    consistency: { testcaseSha256: record.testcaseSha256 },
    input: {
      testcase: record.testcase.name,
      platform: record.testcase.platform,
      instruction:
        record.testcase.instruction[record.testcase.instructionLanguage],
      groundTruth: record.testcase.groundTruth,
      model: `${model}-api-v1`,
      displayName: model,
      family: 'qwen3',
    },
    output: attempt.output,
    profiling: attempt.profiling,
    attempts: [attempt],
  };
}

function metadata(models = ['model']): ReportMeta {
  return {
    models: Object.fromEntries(
      models.map((model) => [
        model,
        {
          name: `${model}-api-v1`,
          family: 'qwen3',
          displayName: model,
          displayFamily: 'Captured',
          reference: {
            source: 'Captured source',
            url: 'https://example.com/source',
            observedAt: '2026-11-17',
            note: 'Original note',
            pricing: { currency: 'USD', inputPerToken: 1, outputPerToken: 2 },
          },
        },
      ]),
    ),
    families: {
      Captured: { color: '#123456', logo: 'https://example.com/logo.svg' },
    },
  };
}

async function report({
  records = [testcase('one')],
  results = records.map((record) => result(record)),
  meta = metadata(),
}: {
  records?: LoadedTestcase[];
  results?: Result[];
  meta?: ReportMeta;
} = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'grounding-merge-'));
  temporary.push(directory);
  const run = path.join(directory, 'run');
  await mkdir(run);
  for (const record of records)
    await writeFixture(path.join(run, 'testcases'), record);
  await writeFile(path.join(run, 'meta.json'), JSON.stringify(meta));
  for (const item of results) {
    const target = path.join(run, 'results', item.input.displayName);
    await mkdir(target, { recursive: true });
    await writeFile(
      path.join(target, `${item.input.testcase}.json`),
      JSON.stringify(item),
    );
  }
  const filename = path.join(directory, 'report.html');
  const html = await createReport({ runDirectory: run });
  await writeFile(filename, html);
  // HTML alone must suffice: no snapshots or result files remain available.
  await rm(run, { recursive: true });
  return { filename, html, data: payload(html) };
}

function payload(html: string) {
  return JSON.parse(
    html.split('type="application/json">')[1].split('</script>')[0],
  );
}

async function savePayload(filename: string, data: unknown) {
  await writeFile(
    filename,
    `<script id="benchmark-data" type="application/json">${JSON.stringify(data)}</script>`,
  );
}

describe('standalone report merging', () => {
  it('merges partial reruns by model and testcase, preserving snapshots and replacing whole results and metadata', async () => {
    const one = testcase('one');
    const two = testcase('two');
    const three = testcase('three');
    const original = await report({
      records: [one, two],
      results: [
        result(one),
        result(two),
        result(one, 'other'),
        result(two, 'other'),
      ],
      meta: metadata(['model', 'other']),
    });
    const failed = result(one);
    failed.output = {
      type: 'ERROR',
      correct: false,
      error: { name: 'Error', message: 'Provider failed', retryable: true },
    };
    failed.profiling = { ...failed.profiling, durationMs: 900 };
    failed.attempts = [{ output: failed.output, profiling: failed.profiling }];
    const latestMeta = metadata();
    latestMeta.models!.model.reference = {
      source: 'New source',
      url: 'https://example.com/new',
      observedAt: '2026-11-18',
      pricing: { currency: 'USD', inputPerToken: 0.5, outputPerToken: 1 },
    };
    latestMeta.families!.Captured = { color: '#abcdef' };
    const latest = await report({
      records: [one, three],
      results: [failed, result(three)],
      meta: latestMeta,
    });
    latest.data.summaries = { count: 10000, score: 100 };
    await savePayload(latest.filename, latest.data);
    const mergedHTML = await mergeReports({
      reportFiles: [original.filename, latest.filename],
    });
    const merged = payload(mergedHTML);

    expect(
      merged.testcases.map((record: { name: string }) => record.name),
    ).toEqual(['one', 'three', 'two']);
    expect(new Set(merged.models)).toEqual(new Set(['model', 'other']));
    expect(merged.results).toHaveLength(5);
    expect(
      merged.results.find(
        (item: Result) =>
          item.input.displayName === 'model' && item.input.testcase === 'one',
      ),
    ).toEqual(failed);
    expect(
      merged.results.find(
        (item: Result) =>
          item.input.displayName === 'model' && item.input.testcase === 'two',
      ),
    ).toEqual(result(two));
    expect(merged.meta.models.model).toEqual(latestMeta.models!.model);
    expect(merged.meta.models.other).toEqual(original.data.meta.models.other);
    expect(merged.meta.families.Captured).toEqual({ color: '#abcdef' });
    expect(merged.summaries).toMatchObject({
      total: 6,
      count: 5,
      missing: 1,
      correct: 4,
      errors: 1,
      score: 80,
    });
    const modelSummary = merged.summaries.models.find(
      (model: { model: string }) => model.model === 'model',
    );
    expect(modelSummary).toMatchObject({
      count: 3,
      estimatedCost: { average: 7 },
    });
    expect(modelSummary.duration.average).toBeCloseTo(1100 / 3);
    for (const record of merged.testcases) {
      const source = [one, two, three].find(
        (item) => item.testcase.name === record.name,
      )!;
      expect(record.indexJson).toBe(
        source.files['index.json'].toString('utf8'),
      );
      expect(record.indexSha256).toBe(
        source.files['index.sha256'].toString('utf8'),
      );
      expect(record.image).toBe(
        `data:image/png;base64,${source.files['image.png'].toString('base64')}`,
      );
    }
    expect(await readFile(original.filename, 'utf8')).toBe(original.html);
    await writeFile(latest.filename, mergedHTML);
    const again = payload(
      await mergeReports({ reportFiles: [original.filename, latest.filename] }),
    );
    expect(again.results).toEqual(merged.results);
    expect(again.summaries).toEqual(merged.summaries);
  });

  it('uses input order rather than success or evaluation timestamp', async () => {
    const record = testcase('one');
    const incorrect = result(record);
    incorrect.output = { type: 'REFUSAL', correct: false };
    incorrect.attempts = [
      { output: incorrect.output, profiling: incorrect.profiling },
    ];
    const first = await report({ results: [incorrect] });
    const second = await report();
    first.data.evaluationId = '9999999999999';
    second.data.evaluationId = '1';
    await savePayload(first.filename, first.data);
    await savePayload(second.filename, second.data);
    expect(
      payload(
        await mergeReports({ reportFiles: [first.filename, second.filename] }),
      ).summaries.correct,
    ).toBe(1);
    expect(
      payload(
        await mergeReports({ reportFiles: [second.filename, first.filename] }),
      ).summaries.correct,
    ).toBe(0);
  });

  it('adds independently evaluated models without replacing existing models', async () => {
    const first = await report();
    const second = await report({
      results: [result(testcase('one'), 'another')],
      meta: metadata(['another']),
    });
    const merged = payload(
      await mergeReports({ reportFiles: [first.filename, second.filename] }),
    );
    expect(new Set(merged.models)).toEqual(new Set(['model', 'another']));
    expect(merged.summaries).toMatchObject({
      total: 2,
      count: 2,
      missing: 0,
      correct: 2,
    });
  });

  it('rejects different versions of the same testcase instead of mixing outcomes', async () => {
    const first = await report();
    const second = await report({
      records: [
        testcase('one', {
          instruction: { en: 'A different target', zh: '不同目标' },
        }),
      ],
    });
    await expect(
      mergeReports({ reportFiles: [first.filename, second.filename] }),
    ).rejects.toThrow(/one/);
  });

  it.each(['name', 'family', 'protocol', 'reasoningEnabled'] as const)(
    'rejects conflicting model identity: %s',
    async (field) => {
      const first = await report();
      const second = await report();
      second.data.meta.models.model[field] =
        field === 'reasoningEnabled'
          ? true
          : field === 'protocol'
            ? 'openai-responses'
            : 'different';
      if (field === 'name') second.data.results[0].input.model = 'different';
      if (field === 'family') second.data.results[0].input.family = 'different';
      await savePayload(second.filename, second.data);
      await expect(
        mergeReports({ reportFiles: [first.filename, second.filename] }),
      ).rejects.toThrow(/model/i);
    },
  );

  it.each(['testcase', 'model', 'result'] as const)(
    'rejects duplicate %s identities inside one source report',
    async (kind) => {
      const first = await report();
      const second = await report();
      if (kind === 'testcase')
        first.data.testcases.push(first.data.testcases[0]);
      if (kind === 'model') first.data.models.push(first.data.models[0]);
      if (kind === 'result') first.data.results.push(first.data.results[0]);
      await savePayload(first.filename, first.data);
      await expect(
        mergeReports({ reportFiles: [first.filename, second.filename] }),
      ).rejects.toThrow();
    },
  );

  it.each([
    'indexJson',
    'image',
    'displayedInstruction',
    'resultSha',
    'correctness',
    'externalImage',
    'modelList',
  ] as const)(
    'validates %s even when a later report could overwrite it',
    async (field) => {
      const first = await report();
      const second = await report();
      const embedded = first.data.testcases[0];
      if (field === 'indexJson') embedded.indexJson += ' ';
      if (field === 'image')
        embedded.image = `data:image/png;base64,${Buffer.from('corrupt').toString('base64')}`;
      if (field === 'displayedInstruction')
        embedded.instruction.en = 'A forged displayed prompt';
      if (field === 'resultSha')
        first.data.results[0].consistency.testcaseSha256 = '0'.repeat(64);
      if (field === 'correctness') {
        first.data.results[0].output.correct = false;
        first.data.results[0].attempts[0].output.correct = false;
      }
      if (field === 'externalImage')
        embedded.image = 'https://example.com/image.png';
      if (field === 'modelList') first.data.models = ['missing-model'];
      await savePayload(first.filename, first.data);
      await expect(
        mergeReports({ reportFiles: [first.filename, second.filename] }),
      ).rejects.toThrow();
    },
  );

  it('requires two reports and rejects viewer data, missing payloads and malformed JSON', async () => {
    const first = await report();
    const second = await report();
    await expect(mergeReports({ reportFiles: [] })).rejects.toThrow();
    await expect(
      mergeReports({ reportFiles: [first.filename] }),
    ).rejects.toThrow();
    for (const html of [
      '<html>No report data</html>',
      '<script id="benchmark-data" type="application/json">{</script>',
    ]) {
      await writeFile(second.filename, html);
      await expect(
        mergeReports({ reportFiles: [first.filename, second.filename] }),
      ).rejects.toThrow();
    }
    second.data.mode = 'viewer';
    await savePayload(second.filename, second.data);
    await expect(
      mergeReports({ reportFiles: [first.filename, second.filename] }),
    ).rejects.toThrow();
  });
});
