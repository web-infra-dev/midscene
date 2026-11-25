import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import * as actual from 'node:fs/promises' with { rstest: 'importActual' };
import os from 'node:os';
import path from 'node:path';
import {
  createReport,
  mergeReports,
  stringifyReportData,
} from '@/benchmark-grounding/core/reporter';
import type {
  LoadedTestcase,
  ReportMetaInput,
  Result,
} from '@/benchmark-grounding/core/schemas';
import { afterEach, describe, expect, it, rs } from '@rstest/core';
import { fixture as testcase, writeFixture } from '../fixture';

rs.mock('node:fs/promises', () => ({
  ...actual,
  readFile: (filename: string | URL, options?: 'utf8') => {
    if (
      filename instanceof URL &&
      /\/(ui|brief)-template\.html$/.test(filename.pathname)
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
  rs.restoreAllMocks();
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

function metadata(models = ['model']): ReportMetaInput {
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
            pricing: { inputPerToken: 1, outputPerToken: 2 },
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
  license,
}: {
  records?: LoadedTestcase[];
  results?: Result[];
  meta?: ReportMetaInput;
  license?: string;
} = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'grounding-merge-'));
  temporary.push(directory);
  const run = path.join(directory, 'run');
  await mkdir(run);
  for (const record of records)
    await writeFixture(path.join(run, 'testcases'), record);
  await writeFile(path.join(run, 'meta.json'), JSON.stringify(meta));
  if (license !== undefined)
    await writeFile(path.join(run, 'LICENSE'), license);
  for (const item of results) {
    const target = path.join(run, 'results', item.input.displayName);
    await mkdir(target, { recursive: true });
    await writeFile(
      path.join(target, `${item.input.testcase}.json`),
      JSON.stringify(item),
    );
  }
  const filename = path.join(directory, 'report', 'index.html');
  const bundle = await createReport({ runDirectory: run });
  await saveBundle(filename, bundle);
  // The published bundle must suffice: no run artifacts remain available.
  await rm(run, { recursive: true });
  return { filename, ...bundle, data: payload(bundle) };
}

type ReportBundle = Awaited<ReturnType<typeof createReport>>;

async function saveBundle(filename: string, { html, files }: ReportBundle) {
  const directory = path.dirname(filename);
  await mkdir(directory, { recursive: true });
  for (const [relativePath, contents] of files) {
    const target = path.join(directory, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, contents);
  }
  await writeFile(filename, html);
}

function payload({ html }: Pick<ReportBundle, 'html'>) {
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

describe('report bundle merging', () => {
  it('preserves infinite throughput in packaged and merged reports and recalculates duration from the retained results', async () => {
    const first = await report();
    const two = testcase('two');
    const latest = result(two);
    Object.assign(latest.profiling, {
      calls: 2,
      totalCompletionTokens: 1_000_000,
      totalTokens: 1_000_010,
    });
    const meta = metadata();
    const performance = {
      timeToFirstTokenMs: 25,
      outputTokensPerSecond: 'INFINITY',
    } as const;
    meta.models!.model.reference!.performance = performance;
    const second = await report({ records: [two], results: [latest], meta });
    const bundle = await mergeReports({
      reportFiles: [first.filename, second.filename],
    });
    const merged = payload(bundle);

    for (const data of [second.data, merged]) {
      expect(data.meta.models.model.reference.performance).toEqual(performance);
      expect(data.summaries.models[0].reference.performance).toEqual(
        performance,
      );
    }
    for (const { metrics } of [second, bundle]) {
      const serialized = JSON.parse(stringifyReportData(metrics));
      expect(serialized.summaries.models[0].reference.performance).toEqual(
        performance,
      );
    }
    expect(second.data.summaries.models[0].performance.average).toBe(0.05);
    expect(merged.summaries.models[0].performance).toEqual({
      count: 2,
      total: 0.075,
      average: 0.0375,
    });
  });

  it('reports the observed revisions of retained results across reruns', async () => {
    const records = [testcase('one'), testcase('two')];
    const earlier = records.map((record) => result(record));
    earlier[0].profiling.snapshotIds = ['replaced-release'];
    earlier[1].profiling.snapshotIds = ['retained-release'];
    const latest = result(records[0]);
    latest.profiling.snapshotIds = ['latest-retained-revision'];
    const first = await report({ records, results: earlier });
    const second = await report({ records: [records[0]], results: [latest] });
    const merged = payload(
      await mergeReports({ reportFiles: [first.filename, second.filename] }),
    );
    expect(merged.summaries.models[0].snapshotIds).toEqual([
      'latest-retained-revision',
      'retained-release',
    ]);
  });

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
      pricing: { inputPerToken: 0.5, outputPerToken: 1 },
    };
    latestMeta.families!.Captured = { color: '#abcdef' };
    const latest = await report({
      records: [one, three],
      results: [failed, result(three)],
      meta: latestMeta,
    });
    latest.data.summaries = { count: 10000, accuracy: 100 };
    await savePayload(latest.filename, latest.data);
    await writeFile(
      path.join(path.dirname(latest.filename), 'metrics.json'),
      JSON.stringify({ summaries: latest.data.summaries }),
    );
    const bundle = await mergeReports({
      reportFiles: [original.filename, latest.filename],
    });
    const merged = payload(bundle);
    expect(bundle.evaluationId).toMatch(/^\d+$/);
    expect(merged).toMatchObject({
      evaluationId: bundle.evaluationId,
      meta: { evaluationId: bundle.evaluationId },
    });

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
      accuracy: 80,
    });
    expect(JSON.parse(stringifyReportData(bundle.metrics))).toStrictEqual({
      schemaVersion: 2,
      evaluationId: bundle.evaluationId,
      summaries: merged.summaries,
      overview: merged.overview,
    });
    expect(payload({ html: bundle.briefHtml }).scatter).toEqual(
      merged.overview.chart.scatter,
    );
    const modelSummary = merged.summaries.models.find(
      (model: { model: string }) => model.model === 'model',
    );
    expect(modelSummary).toMatchObject({
      count: 3,
      economy: 1 / 7,
      economyCount: 2,
      performance: { count: 2, average: 0.1 },
      duration: { count: 2, average: 100 },
    });
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
        `screenshots/${source.testcase.reference.image.sha256}.png`,
      );
      expect(bundle.files.get(record.image)).toEqual(source.files['image.png']);
    }
    expect([...bundle.files.keys()]).toEqual([merged.testcases[0].image]);
    expect(await readFile(original.filename, 'utf8')).toBe(original.html);
    await saveBundle(latest.filename, bundle);
    const again = payload(
      await mergeReports({
        reportFiles: [path.dirname(original.filename), latest.filename],
      }),
    );
    expect(again.results).toEqual(merged.results);
    expect(again.summaries).toEqual(merged.summaries);
  });

  it('merges CDN report assets and deduplicates licenses in input order', async () => {
    const record = testcase('one');
    const incorrect = result(record);
    incorrect.output = { type: 'REFUSAL', correct: false };
    incorrect.attempts = [
      { output: incorrect.output, profiling: incorrect.profiling },
    ];
    const remoteLicense = 'Copyright © First\r\n';
    const localLicense = 'Copyright © Second\n';
    const first = await report({
      results: [incorrect],
      license: remoteLicense,
    });
    const second = await report({ license: localLicense });
    first.data.evaluationId = '9999999999999';
    second.data.evaluationId = '1';
    await savePayload(first.filename, first.data);
    await savePayload(second.filename, second.data);
    const http = new URL('http://cdn.example/reports/v2/?token=fixture');
    const https = new URL('https://cdn.example/reports/v2/?token=fixture');
    const location = new URL('https://cdn.example/reports/deployed/index.html');
    const remoteHtml = await readFile(first.filename, 'utf8');
    const fetch = rs
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) => {
        if ([http.href, https.href].includes(String(input))) {
          const response = new Response(remoteHtml);
          if (String(input) === https.href)
            Object.defineProperty(response, 'url', { value: location.href });
          return response;
        }
        const contents = [...first.files].find(([file]) =>
          [http, location].some(
            (base) => new URL(file, base).href === String(input),
          ),
        )?.[1];
        if (contents === undefined)
          throw new Error(`Unexpected request ${String(input)}`);
        return new Response(
          typeof contents === 'string' ? contents : new Uint8Array(contents),
        );
      });
    const latestLocal = payload(
      await mergeReports({
        reportFiles: [http, first.filename, second.filename],
      }),
    );
    const latestRemote = payload(
      await mergeReports({ reportFiles: [second.filename, https] }),
    );
    expect(latestLocal.summaries.correct).toBe(1);
    expect(latestLocal.datasetLicenses).toEqual([remoteLicense, localLicense]);
    expect(latestRemote.summaries.correct).toBe(0);
    expect(latestRemote.datasetLicenses).toEqual([localLicense, remoteLicense]);
    expect(fetch.mock.calls.map(([input]) => String(input)).sort()).toEqual(
      [
        http.href,
        https.href,
        ...[...first.files.keys()].flatMap((file) => [
          new URL(file, http).href,
          new URL(file, location).href,
        ]),
      ].sort(),
    );
  });

  it('merges a legacy standalone HTML report with a packaged report', async () => {
    const one = testcase('one');
    const legacy = await report({
      records: [one],
      license: 'Legacy redistribution notice',
    });
    const data = { ...legacy.data, reportFormat: undefined };
    data.testcases = data.testcases.map((record: { image: string }) => ({
      ...record,
      image: `data:image/png;base64,${one.files['image.png'].toString('base64')}`,
    }));
    const legacyFile = path.join(path.dirname(legacy.filename), 'legacy.html');
    await savePayload(legacyFile, data);
    const newer = await report({ records: [testcase('two')] });
    const merged = payload(
      await mergeReports({ reportFiles: [legacyFile, newer.filename] }),
    );
    expect(merged.datasetLicenses).toEqual(['Legacy redistribution notice']);
    expect(merged.results).toEqual([result(one), result(testcase('two'))]);
  });

  it('reports an HTTPS download failure without exposing the URL query', async () => {
    const local = await report();
    const remote = new URL('https://cdn.example/missing.html?token=fixture');
    rs.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Not Found', { status: 404 }),
    );

    await expect(
      mergeReports({ reportFiles: [local.filename, remote] }),
    ).rejects.toThrow(
      'Cannot merge report https://cdn.example/missing.html: Download failed (HTTP 404)',
    );
  });

  it('merges v1 result assets as JSON and rejects extra executable statements', async () => {
    const first = await report();
    const second = await report({ records: [testcase('two')] });
    const manifest = {
      ...first.data,
      reportFormat: 'static-v1',
      results: undefined,
      outcomes: { one: { model: 'passed' } },
    };
    const sha = first.data.testcases[0].testcaseSha256;
    const file = path.join(
      path.dirname(first.filename),
      'results',
      `${sha}.js`,
    );
    const script = `globalThis.__MIDSCENE_GROUNDING_RESULTS__ ??= {};\nglobalThis.__MIDSCENE_GROUNDING_RESULTS__["${sha}"] = ${JSON.stringify(first.data.results)};\n`;
    await savePayload(first.filename, manifest);
    await mkdir(path.dirname(file));
    await writeFile(file, script);
    const reportFiles = [first.filename, second.filename];
    const merged = payload(await mergeReports({ reportFiles }));
    expect(merged.results).toEqual([
      ...first.data.results,
      ...second.data.results,
    ]);
    expect(merged.reportFormat).toBe('static-v2');

    await savePayload(first.filename, {
      ...manifest,
      outcomes: { one: { model: 'failed' } },
    });
    await expect(mergeReports({ reportFiles })).rejects.toThrow(
      /outcomes do not match/,
    );
    await savePayload(first.filename, manifest);
    await writeFile(file, `${script}globalThis.extraCode = true;\n`);
    await expect(mergeReports({ reportFiles })).rejects.toThrow(
      /Invalid testcase result asset/,
    );
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
        await writeFile(
          path.join(path.dirname(first.filename), embedded.image),
          'corrupt',
        );
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
