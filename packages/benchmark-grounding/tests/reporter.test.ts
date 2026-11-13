import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  rm,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import * as actual from 'node:fs/promises' with { rstest: 'importActual' };
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, rs } from '@rstest/core';
import { presetMeta } from '../src/presets';
import { mergeReportMeta } from '../src/presets/normalize';
import { createReport, createViewer } from '../src/reporter';
import {
  type LoadedTestcase,
  type ReportMeta,
  type Result,
  type RunManifest,
  reportMetaSchema,
} from '../src/schemas';

rs.mock('node:fs/promises', () => {
  return {
    ...actual,
    readFile: (filename: string | URL, options?: 'utf8') => {
      if (
        filename instanceof URL &&
        filename.pathname.endsWith('/ui-template.html')
      ) {
        return Promise.resolve(
          '<!doctype html><title>Midscene Grounding Benchmark</title><script id="benchmark-data" type="application/json">__MIDSCENE_BENCHMARK_DATA__</script>',
        );
      }
      return options === 'utf8'
        ? actual.readFile(filename, 'utf8')
        : actual.readFile(filename);
    },
  };
});

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporary
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
const hash = (bytes: Buffer) =>
  createHash('sha256').update(bytes).digest('hex');

function testcase(
  name = 'one',
  instruction = 'Find the pixel',
): LoadedTestcase {
  const image = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aG2kAAAAASUVORK5CYII=',
    'base64',
  );
  const data = {
    schemaVersion: 1 as const,
    name,
    platform: 'web' as const,
    category: { item: 'Basic Element', reason: 'Visible' },
    instruction: { en: instruction, zh: '找到像素' },
    instructionLanguage: 'en' as const,
    groundTruth: [0, 1, 1, 0] as [number, number, number, number],
    reference: {
      url: 'https://example.com/source',
      dataset: 'fixture',
      recordId: '1',
      image: { format: 'png' as const, sha256: hash(image) },
      patch: '',
      collectedAt: 1,
    },
  };
  const json = Buffer.from(`${JSON.stringify(data, null, 2)}\n`);
  const sha = hash(json);
  return {
    testcase: data,
    testcaseSha256: sha,
    files: {
      'index.json': json,
      'index.sha256': Buffer.from(`${sha}\n`),
      'image.png': image,
    },
  };
}

function manifest(record: LoadedTestcase): RunManifest {
  return {
    schemaVersion: 1,
    id: 'fixture',
    startedAt: '2026-11-12',
    status: 'completed',
    planned: 1,
    completed: 1,
    options: { concurrency: 1, retries: 2, timeoutMs: 60000 },
    versions: { package: '1', sdk: '1' },
    models: [
      {
        name: 'api-model',
        family: 'qwen3',
        displayName: 'model',
        directory: 'model',
      },
    ],
    testcases: [
      { name: record.testcase.name, testcaseSha256: record.testcaseSha256 },
    ],
    tasks: [{ model: 'model', testcase: record.testcase.name }],
  };
}

function result(record: LoadedTestcase): Result {
  const attempt = {
    output: {
      type: 'POINT' as const,
      correct: true,
      center: [0.5, 0.5] as [number, number],
    },
    profiling: {
      durationMs: 100,
      usageStatus: 'complete' as const,
      calls: 1,
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
      model: 'api-model',
      family: 'qwen3',
      displayName: 'model',
      platform: 'web',
      instruction: record.testcase.instruction.en,
      groundTruth: record.testcase.groundTruth,
    },
    output: attempt.output,
    profiling: attempt.profiling,
    attempts: [attempt],
  };
}

const capturedMeta: ReportMeta = {
  models: {
    model: {
      displayFamily: 'Captured',
      reference: {
        source: 'Snapshot source',
        url: 'https://example.com/reference',
        observedAt: '2026-11-12',
        pricing: { currency: 'USD', inputPerToken: 1, outputPerToken: 2 },
      },
    },
  },
  families: {
    Captured: { color: '#123456', logo: 'data:image/svg+xml;base64,PHN2Zy8+' },
  },
};

async function fixture(record = testcase()) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'grounding-report-'));
  temporary.push(directory);
  await mkdir(path.join(directory, 'testcases', record.testcase.name), {
    recursive: true,
  });
  await mkdir(path.join(directory, 'results', 'model'), { recursive: true });
  await Promise.all([
    ...Object.entries(record.files).map(([name, bytes]) =>
      writeFile(
        path.join(directory, 'testcases', record.testcase.name, name),
        bytes,
      ),
    ),
    writeFile(
      path.join(directory, 'run.json'),
      JSON.stringify(manifest(record)),
    ),
    writeFile(path.join(directory, 'meta.json'), JSON.stringify(capturedMeta)),
    writeFile(
      path.join(directory, 'results', 'model', `${record.testcase.name}.json`),
      JSON.stringify(result(record)),
    ),
  ]);
  return { directory, record };
}

function payload(html: string) {
  return JSON.parse(
    html.split('type="application/json">')[1].split('</script>')[0],
  );
}

describe('grounding HTML assembly', () => {
  it('embeds raw snapshot JSON, SHA, and image once, safely escaping script terminators', async () => {
    const record = testcase(
      'one',
      '</script><script>alert("x")</script>&\u2028\u2029$&',
    );
    const html = await createViewer({ testcases: [record] });
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('\\u003c/script\\u003e');
    const data = payload(html);
    expect(data.mode).toBe('viewer');
    expect(data.testcases[0].instruction.en).toBe(
      record.testcase.instruction.en,
    );
    expect(data.testcases[0].indexJson).toBe(
      record.files['index.json'].toString('utf8'),
    );
    expect(data.testcases[0].indexSha256).toBe(
      record.files['index.sha256'].toString('utf8'),
    );
    expect(data.testcases[0].image).toMatch(/^data:image\/png;base64,/);
  });

  it('validates caller data and sorts the viewer by complete testcase name', async () => {
    expect(
      payload(
        await createViewer({ testcases: [testcase('two'), testcase('one')] }),
      ).testcases.map((item: { name: string }) => item.name),
    ).toEqual(['one', 'two']);
    const record = testcase();
    record.testcase.instruction.en = 'Mutable caller value';
    await expect(createViewer({ testcases: [record] })).rejects.toThrow(
      /does not match/,
    );
    await expect(
      createViewer({ testcases: [testcase(), testcase()] }),
    ).rejects.toThrow(/Duplicate/);
  });

  it('can reference served images without embedding their bytes or skipping validation', async () => {
    const record = testcase('case with # and ?');
    const html = await createViewer({
      testcases: [record],
      imageBaseUrl: '/images/',
    });
    const data = payload(html);
    expect(data.testcases[0].image).toBe(
      `/images/case%20with%20%23%20and%20%3F/image.png?sha256=${record.testcase.reference.image.sha256}`,
    );
    expect(data.testcases[0].indexJson).toBe(
      record.files['index.json'].toString('utf8'),
    );
    expect(html).not.toContain(record.files['image.png'].toString('base64'));
    record.files['image.png'].fill(0);
    await expect(
      createViewer({ testcases: [record], imageBaseUrl: '/images' }),
    ).rejects.toThrow('image SHA-256 mismatch');
  });

  it('regenerates using only saved snapshots and captured metadata', async () => {
    const { directory, record } = await fixture();
    record.files['image.png'].fill(0);
    record.testcase.instruction.en = 'Caller changed';
    const html = await createReport({ runDirectory: directory });
    const data = payload(html);
    expect(data.incomplete).toBe(false);
    expect(data.results).toHaveLength(1);
    expect(data.testcases[0].instruction.en).toBe('Find the pixel');
    expect(data.meta).toEqual(capturedMeta);
    expect(data.summaries.models[0].estimatedCost.average).toBe(14);
    expect(html).not.toContain('apiKey');
    expect(html).not.toContain('baseUrl');
  });

  it('renders an incomplete report when results have not yet been saved', async () => {
    const { directory } = await fixture();
    await unlink(path.join(directory, 'results', 'model', 'one.json'));
    const data = payload(await createReport({ runDirectory: directory }));
    expect(data).toMatchObject({ incomplete: true, missingResults: 1 });
    expect(data.summaries.models[0]).toMatchObject({
      count: 0,
      missing: 1,
      score: null,
    });
  });

  it('rejects missing or damaged metadata instead of using current presets', async () => {
    const { directory } = await fixture();
    await unlink(path.join(directory, 'meta.json'));
    await expect(createReport({ runDirectory: directory })).rejects.toThrow();
    await writeFile(path.join(directory, 'meta.json'), '{}');
    await expect(createReport({ runDirectory: directory })).rejects.toThrow(
      /complete models and families/,
    );
    await writeFile(
      path.join(directory, 'meta.json'),
      JSON.stringify({
        ...capturedMeta,
        families: { Captured: { color: '#123', logo: '/source/logo.svg' } },
      }),
    );
    await expect(createReport({ runDirectory: directory })).rejects.toThrow(
      /embedded/,
    );
  });

  it('rejects modified testcase bytes and a result with the wrong testcase SHA', async () => {
    const first = await fixture();
    await writeFile(
      path.join(first.directory, 'testcases', 'one', 'index.json'),
      Buffer.concat([first.record.files['index.json'], Buffer.from(' ')]),
    );
    await expect(
      createReport({ runDirectory: first.directory }),
    ).rejects.toThrow(/SHA-256 mismatch/);
    const second = await fixture();
    const wrong = result(second.record);
    wrong.consistency.testcaseSha256 = '0'.repeat(64);
    await writeFile(
      path.join(second.directory, 'results', 'model', 'one.json'),
      JSON.stringify(wrong),
    );
    await expect(
      createReport({ runDirectory: second.directory }),
    ).rejects.toThrow(/SHA-256/);
  });

  it('rejects snapshots that point to resources outside the saved run', async () => {
    const { directory } = await fixture();
    const image = path.join(directory, 'testcases', 'one', 'image.png');
    await unlink(image);
    await symlink('/nonexistent/external-image.png', image);
    await expect(createReport({ runDirectory: directory })).rejects.toThrow(
      /regular testcase files/,
    );
  });

  it('rejects a manifest whose snapshot hashes or task identities have been changed', async () => {
    const { directory, record } = await fixture();
    const changed = manifest(record);
    changed.testcases[0].testcaseSha256 = '0'.repeat(64);
    await writeFile(path.join(directory, 'run.json'), JSON.stringify(changed));
    await expect(createReport({ runDirectory: directory })).rejects.toThrow(
      /identities or SHA-256/,
    );
    changed.tasks[0].model = 'unknown';
    await writeFile(path.join(directory, 'run.json'), JSON.stringify(changed));
    await expect(createReport({ runDirectory: directory })).rejects.toThrow(
      /planned model\/testcase/,
    );
  });

  it.each([
    'model',
    'family',
    'displayName',
    'testcase',
    'instruction',
    'platform',
    'groundTruth',
  ] as const)(
    'rejects result input inconsistent with saved identity: %s',
    async (field) => {
      const { directory, record } = await fixture();
      const wrong = result(record);
      Object.assign(wrong.input, {
        [field]:
          field === 'groundTruth'
            ? 'REFUSAL'
            : field === 'platform'
              ? 'mobile'
              : 'wrong-value',
      });
      await writeFile(
        path.join(directory, 'results', 'model', 'one.json'),
        JSON.stringify(wrong),
      );
      await expect(createReport({ runDirectory: directory })).rejects.toThrow();
    },
  );

  it('rejects duplicated manifest tasks, unknown result directories and incorrect final outputs', async () => {
    const first = await fixture();
    const run = manifest(first.record);
    run.tasks.push(run.tasks[0]);
    await writeFile(
      path.join(first.directory, 'run.json'),
      JSON.stringify(run),
    );
    await expect(
      createReport({ runDirectory: first.directory }),
    ).rejects.toThrow(/Duplicate tasks/);
    const second = await fixture();
    await mkdir(path.join(second.directory, 'results', 'unknown'));
    await expect(
      createReport({ runDirectory: second.directory }),
    ).rejects.toThrow(/Unexpected model/);
    const third = await fixture();
    const wrong = result(third.record);
    wrong.output = { type: 'REFUSAL', correct: false };
    await writeFile(
      path.join(third.directory, 'results', 'model', 'one.json'),
      JSON.stringify(wrong),
    );
    await expect(
      createReport({ runDirectory: third.directory }),
    ).rejects.toThrow(/last attempt/);
  });
});

describe('public metadata snapshots', () => {
  it('retains all model reference data and embeds every preset logo', () => {
    expect(Object.keys(presetMeta.models!)).toHaveLength(34);
    expect(reportMetaSchema.safeParse(presetMeta).success).toBe(true);
    expect(presetMeta.models!['qwen3.8-max'].reference?.url).toBe(
      'https://openrouter.ai/qwen/qwen3.8-max-0902',
    );
    expect(
      Object.values(presetMeta.families!).every(
        (family) => !family.logo || family.logo.startsWith('data:image/'),
      ),
    ).toBe(true);
    expect(JSON.stringify(presetMeta)).not.toContain('apiKey');
    expect(JSON.stringify(presetMeta)).not.toContain('baseUrl');
  });

  it('replaces entire matching entries, captures local logo bytes, and retains no caller references', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'grounding-logo-'));
    temporary.push(directory);
    const logo = path.join(directory, 'custom.svg');
    await writeFile(logo, '<svg/>');
    const input: ReportMeta = {
      models: { 'qwen3.8-max': { displayFamily: 'Custom' } },
      families: { Custom: { color: '#abcdef', logo } },
    };
    const promise = mergeReportMeta(input);
    input.models!['qwen3.8-max'].displayFamily = 'Mutated';
    const saved = await promise;
    await unlink(logo);
    expect(saved.models!['qwen3.8-max']).toEqual({ displayFamily: 'Custom' });
    expect(saved.families!.Custom.logo).toBe(
      'data:image/svg+xml;base64,PHN2Zy8+',
    );
    expect(saved.models!['qwen3.8-flash']).toBeDefined();
    const report = await fixture();
    await writeFile(
      path.join(report.directory, 'meta.json'),
      JSON.stringify(saved),
    );
    expect(
      payload(await createReport({ runDirectory: report.directory })).meta,
    ).toEqual(saved);
  });

  it('rejects logo URLs and missing local files', async () => {
    await expect(
      mergeReportMeta({
        families: {
          Remote: { color: '#123', logo: 'https://example.com/logo.svg' },
        },
      }),
    ).rejects.toThrow(/local file/);
    await expect(
      mergeReportMeta({
        families: {
          Missing: { color: '#123', logo: '/nonexistent/grounding-logo.svg' },
        },
      }),
    ).rejects.toThrow();
  });

  it('preserves an existing percent-encoded image data URI without filesystem reads', async () => {
    const logo = 'data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E';
    const saved = await mergeReportMeta({
      families: { Encoded: { color: '#123', logo } },
    });
    expect(saved.families!.Encoded.logo).toBe(logo);
  });
});

it('embeds an absolute Windows logo path using Windows filesystem semantics', async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'grounding-windows-logo-'),
  );
  temporary.push(directory);
  const localLogo = path.join(directory, 'custom.svg');
  await writeFile(localLogo, '<svg/>');
  const windowsLogo = 'C:\\logos\\custom.svg';
  const originalResolve = path.resolve;
  const absolute = rs
    .spyOn(path, 'isAbsolute')
    .mockImplementation(path.win32.isAbsolute);
  const resolve = rs
    .spyOn(path, 'resolve')
    .mockImplementation((...segments) =>
      segments.includes(windowsLogo) ? localLogo : originalResolve(...segments),
    );
  try {
    const saved = await mergeReportMeta({
      families: { Windows: { color: '#123', logo: windowsLogo } },
    });
    expect(saved.families!.Windows.logo).toBe(
      'data:image/svg+xml;base64,PHN2Zy8+',
    );
  } finally {
    absolute.mockRestore();
    resolve.mockRestore();
  }
});
