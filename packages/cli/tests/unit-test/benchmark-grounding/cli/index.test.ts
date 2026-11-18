import {
  link,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stripVTControlCharacters } from 'node:util';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  rs,
  test,
} from '@rstest/core';
import { version } from '../../../../package.json';

const sdk = rs.hoisted(() => ({
  loadTestcases: rs.fn(),
  resolveDatasetDirectory: rs.fn(),
  createViewer: rs.fn(),
  createReport: rs.fn(),
  mergeReports: rs.fn(),
  runBenchmark: rs.fn(),
}));
const launch = rs.hoisted(() => rs.fn());
const serve = rs.hoisted(() => rs.fn());
const terminalLink = rs.hoisted(() =>
  rs.fn(
    (text: string, _url: string, _options: { fallback: () => string }) => text,
  ),
);
rs.mock('@/benchmark-grounding/core', () => sdk);
rs.mock('open', () => ({ default: launch }));
rs.mock('@hono/node-server', () => ({ serve }));
rs.mock('terminal-link', () => ({ default: terminalLink }));
import { main } from '@/benchmark-grounding';
import { fixture } from '../fixture';

const model = {
  name: 'model',
  family: 'gpt-6',
  baseUrl: 'https://example.com/v1',
  apiKey: 'test-only-key',
};
const reference = {
  source: 'Fixture',
  url: 'https://example.com/metadata',
  observedAt: '2026-11-18',
  pricing: { currency: 'USD', inputPerToken: 0, outputPerToken: 0 },
  performance: { responseLatencyMs: 0 },
};
const temporary: string[] = [];
const environment = { ...process.env };
const defaultDataset = path.join(
  os.tmpdir(),
  'midscene-cache',
  'benchmark-grounding',
  version,
  'testcases',
);

beforeEach(async () => {
  rs.clearAllMocks();
  terminalLink.mockImplementation((text) => text);
  rs.spyOn(process.stdout, 'write').mockReturnValue(true);
  rs.spyOn(process.stderr, 'write').mockReturnValue(true);
  const directory = await mkdtemp(path.join(os.tmpdir(), 'benchmark-cli-cwd-'));
  temporary.push(directory);
  rs.spyOn(process, 'cwd').mockReturnValue(directory);
  sdk.loadTestcases.mockResolvedValue([fixture()]);
  sdk.resolveDatasetDirectory.mockResolvedValue(defaultDataset);
  sdk.createReport.mockResolvedValue(
    '<!doctype html><html>saved report</html>',
  );
  sdk.mergeReports.mockResolvedValue(
    '<!doctype html><html>merged report</html>',
  );
  launch.mockResolvedValue(undefined);
  process.env.MIDSCENE_GROUNDING_EVALUATION_CONFIG = JSON.stringify({
    models: [model],
    meta: { models: { [model.name]: { reference } } },
  });
});
afterEach(async () => {
  rs.restoreAllMocks();
  await Promise.all(
    temporary
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
  process.env = { ...environment };
});

async function runDirectory() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'benchmark-cli-'));
  temporary.push(directory);
  sdk.runBenchmark.mockResolvedValue({ directory });
  return directory;
}

async function expectFailure(args: string[], message?: string) {
  const stderr = rs.mocked(process.stderr.write);
  const offset = stderr.mock.calls.length;
  expect(await main(args)).toBe(1);
  const output = stripVTControlCharacters(
    stderr.mock.calls
      .slice(offset)
      .map(([value]) => value)
      .join(''),
  );
  expect(output).toContain('× ERROR');
  if (message) expect(output).toContain(message);
  return output;
}

describe('CLI preparation', () => {
  test('links validated default or custom testcases using the loader-provided filename', async () => {
    process.env.MIDSCENE_GROUNDING_EVALUATION_CONFIG = 'invalid JSON';
    const records = [fixture('a'), fixture('b')];
    sdk.loadTestcases.mockImplementation(async ({ directory, onProgress }) => {
      for (const record of records)
        onProgress({
          name: record.testcase.name,
          filename: path.resolve(
            directory ?? defaultDataset,
            record.testcase.name,
            'index.json',
          ),
          testcaseSha256: record.testcaseSha256,
        });
      return records;
    });
    const stdout = rs.spyOn(process.stdout, 'write').mockReturnValue(true);
    const stderr = rs.spyOn(process.stderr, 'write').mockReturnValue(true);

    expect(await main(['prepare'])).toBe(0);
    expect(sdk.loadTestcases).toHaveBeenLastCalledWith({
      directory: defaultDataset,
      names: undefined,
      onProgress: expect.any(Function),
    });
    const output = stripVTControlCharacters(
      stdout.mock.calls.map(([message]) => message).join(''),
    );
    expect(output).toContain('PREPARE');
    expect(output).toContain('Midscene Grounding Benchmark');
    expect(output).toContain(
      'Checking testcase data, hashes, screenshots and ground truth.',
    );
    expect(output).toMatch(
      /PASS\s+a[\s\S]*PASS\s+b[\s\S]*Preparation complete: 2 passed, 0 failed \(2 total\)\./,
    );
    expect(output.match(/\bPASS\b/g)).toHaveLength(2);
    expect(output.match(/PASS [^\n]+/g)).toEqual(
      records.map(
        (record) =>
          `PASS ${record.testcase.name} SHA-256 ${record.testcaseSha256}`,
      ),
    );
    expect(terminalLink.mock.calls).toEqual(
      records.map(({ testcase }) => [
        testcase.name,
        pathToFileURL(path.join(defaultDataset, testcase.name, 'index.json'))
          .href,
        { fallback: expect.any(Function) },
      ]),
    );

    await main([
      'prepare',
      '--testcases',
      './dataset 中文',
      '--names',
      'a',
      'b',
    ]);
    expect(sdk.loadTestcases).toHaveBeenLastCalledWith({
      directory: path.resolve('./dataset 中文'),
      names: ['a', 'b'],
      onProgress: expect.any(Function),
    });
    expect(terminalLink.mock.calls.slice(2)).toEqual(
      records.map(({ testcase }) => [
        testcase.name,
        pathToFileURL(path.resolve('dataset 中文', testcase.name, 'index.json'))
          .href,
        { fallback: expect.any(Function) },
      ]),
    );
    for (const [, url, options] of terminalLink.mock.calls)
      expect(options.fallback()).toBe(fileURLToPath(url));
    expect(stderr).not.toHaveBeenCalled();
    expect(sdk.runBenchmark).not.toHaveBeenCalled();
    expect(sdk.createViewer).not.toHaveBeenCalled();
    expect(sdk.createReport).not.toHaveBeenCalled();
    expect(launch).not.toHaveBeenCalled();
    expect(sdk.resolveDatasetDirectory).toHaveBeenCalledTimes(1);
    expect(serve).not.toHaveBeenCalled();
  });

  test('shows download and readiness status before validating the resolved dataset', async () => {
    const events: string[] = [];
    sdk.resolveDatasetDirectory.mockImplementation(async (onStatus) => {
      onStatus(`Downloading @midscene/benchmark-grounding@${version}`);
      events.push('download');
      onStatus(`Dataset ready: ${defaultDataset}`);
      return defaultDataset;
    });
    sdk.loadTestcases.mockImplementation(async ({ directory }) => {
      events.push('validate');
      expect(directory).toBe(defaultDataset);
      return [fixture()];
    });

    expect(await main(['prepare'])).toBe(0);
    const output = stripVTControlCharacters(
      rs
        .mocked(process.stdout.write)
        .mock.calls.map(([value]) => value)
        .join(''),
    );
    expect(events).toEqual(['download', 'validate']);
    expect(output).toContain(
      `Downloading @midscene/benchmark-grounding@${version}`,
    );
    expect(output).toContain(`Dataset ready: ${defaultDataset}`);
    expect(output).toContain('Preparation complete:');
  });

  test('reports all validation outcomes and prints the failure summary', async () => {
    terminalLink.mockImplementation((_text, _url, options) =>
      options.fallback(),
    );
    const filenames = ['a', 'b', 'c', 'd'].map((name) =>
      path.join(defaultDataset, name, 'index.json'),
    );
    const errors = [
      new Error('a: Missing required file "index.sha256"', {
        cause: new Error(
          "ENOENT: no such file or directory, open '/dataset/a/index.sha256'",
        ),
      }),
      new Error('c: image SHA-256 mismatch'),
    ];
    const summary = 'Validation failed: 2 passed, 2 failed (4 total).';
    sdk.loadTestcases.mockImplementation(async ({ onProgress }) => {
      onProgress({ name: 'a', filename: filenames[0], error: errors[0] });
      onProgress({
        name: 'b',
        filename: filenames[1],
        testcaseSha256: fixture('b').testcaseSha256,
      });
      onProgress({ name: 'c', filename: filenames[2], error: errors[1] });
      onProgress({
        name: 'd',
        filename: filenames[3],
        testcaseSha256: fixture('d').testcaseSha256,
      });
      throw new AggregateError(
        errors,
        `${summary}\n${errors.map((error) => error.message).join('\n')}`,
      );
    });
    const stdout = rs.spyOn(process.stdout, 'write').mockReturnValue(true);
    const stderr = rs.spyOn(process.stderr, 'write').mockReturnValue(true);

    await expectFailure(['prepare'], summary);
    const output = stripVTControlCharacters(
      stdout.mock.calls.map(([message]) => message).join(''),
    );
    expect(output).toContain('PREPARE');
    expect(output).toContain('Midscene Grounding Benchmark');
    expect(output.match(/(?:PASS|FAIL) [^\n]+/g)).toEqual([
      `FAIL ${filenames[0]}: Missing required file "index.sha256"`,
      `PASS ${filenames[1]} SHA-256 ${fixture('b').testcaseSha256}`,
      `FAIL ${filenames[2]}: image SHA-256 mismatch`,
      `PASS ${filenames[3]} SHA-256 ${fixture('d').testcaseSha256}`,
    ]);
    expect(output.match(/\b(?:PASS|FAIL)\b/g)).toHaveLength(4);
    expect(terminalLink.mock.calls).toEqual(
      ['a', 'b', 'c', 'd'].map((name) => [
        name,
        pathToFileURL(path.join(defaultDataset, name, 'index.json')).href,
        { fallback: expect.any(Function) },
      ]),
    );
    for (const [, url, options] of terminalLink.mock.calls)
      expect(options.fallback()).toBe(fileURLToPath(url));
    expect(output).not.toContain('Preparation complete:');
    expect(output).not.toContain('ENOENT');
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining(summary));
  });

  test('propagates directory errors without reporting successful validation', async () => {
    sdk.loadTestcases.mockRejectedValue(
      new Error('Cannot read testcase directory: /missing'),
    );
    const stdout = rs.spyOn(process.stdout, 'write').mockReturnValue(true);
    const stderr = rs.spyOn(process.stderr, 'write').mockReturnValue(true);

    await expectFailure(
      ['prepare', '--testcases', '/missing'],
      'Cannot read testcase directory: /missing',
    );
    const output = stripVTControlCharacters(
      stdout.mock.calls.map(([message]) => message).join(''),
    );
    expect(output).toContain('PREPARE');
    expect(output).toContain('Midscene Grounding Benchmark');
    expect(output).not.toMatch(/\b(?:PASS|FAIL)\b|Preparation complete:/);
    expect(terminalLink).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledWith(
      expect.stringContaining('Cannot read testcase directory'),
    );
  });
});

describe('CLI report workflow', () => {
  test('run generates the same report as standalone report and opens it by default', async () => {
    const directory = await runDirectory();
    expect(await main(['run', '--output', directory])).toBe(0);
    const filename = path.join(directory, 'report.html');
    const automatic = await readFile(filename, 'utf8');
    expect(launch).toHaveBeenCalledTimes(1);
    expect(sdk.createReport).toHaveBeenCalledWith({ runDirectory: directory });
    expect(sdk.runBenchmark).toHaveBeenCalledWith(
      expect.objectContaining({
        concurrency: 64,
        retries: 2,
        timeoutMs: 60000,
      }),
    );
    await main(['report', directory]);
    expect(await readFile(filename, 'utf8')).toBe(automatic);
    expect(launch).toHaveBeenCalledTimes(2);
  });

  test('--no-report skips both generation and browser opening', async () => {
    const directory = await runDirectory();
    await main(['run', '--output', directory, '--no-report']);
    expect(sdk.createReport).not.toHaveBeenCalled();
    expect(launch).not.toHaveBeenCalled();
    await expect(
      readFile(path.join(directory, 'report.html')),
    ).rejects.toThrow();
  });

  test('--no-open still generates the report for run and report', async () => {
    const directory = await runDirectory();
    await main(['run', '--output', directory, '--no-open']);
    await main(['report', directory, '--no-open']);
    expect(sdk.createReport).toHaveBeenCalledTimes(2);
    expect(launch).not.toHaveBeenCalled();
  });

  test('a generation failure preserves run artifacts and does not open a browser', async () => {
    const directory = await runDirectory();
    await writeFile(path.join(directory, 'meta.json'), '{"models":{}}');
    sdk.createReport.mockRejectedValue(new Error('Invalid snapshot'));
    await expectFailure(['run', '--output', directory], 'Invalid snapshot');
    expect(await readFile(path.join(directory, 'meta.json'), 'utf8')).toBe(
      '{"models":{}}',
    );
    expect(launch).not.toHaveBeenCalled();
  });

  test('completed model errors still generate and open the automatic report', async () => {
    const directory = await runDirectory();
    sdk.runBenchmark.mockImplementationOnce(async ({ onProgress }) => {
      onProgress({
        completed: 1,
        total: 1,
        model: model.name,
        testcase: 'case-a',
        status: 'ERROR',
        correct: false,
        attemptCount: 1,
        profiling: { durationMs: 0, usageStatus: 'missing' },
      });
      return { directory };
    });
    expect(await main(['run', '--output', directory])).toBe(0);
    expect(sdk.createReport).toHaveBeenCalledWith({ runDirectory: directory });
    expect(launch).toHaveBeenCalledTimes(1);
  });

  test('browser failure keeps the generated file and does not fail the command', async () => {
    const directory = await runDirectory();
    launch.mockRejectedValue(new Error('No browser available'));
    expect(await main(['report', directory])).toBe(0);
    expect(
      await readFile(path.join(directory, 'report.html'), 'utf8'),
    ).toContain('saved report');
  });

  test('standalone report needs no model environment variable and supports an output file', async () => {
    const directory = await runDirectory();
    process.env.MIDSCENE_GROUNDING_EVALUATION_CONFIG = 'invalid JSON';
    const filename = path.join(directory, 'exported', 'report.html');
    await main(['report', directory, '--output', filename, '--no-open']);
    expect(await readFile(filename, 'utf8')).toContain('saved report');
    expect(sdk.runBenchmark).not.toHaveBeenCalled();
  });
});

describe('CLI report merging', () => {
  test('merges ordered HTML inputs without model configuration and opens the default output', async () => {
    process.env.MIDSCENE_GROUNDING_EVALUATION_CONFIG = 'invalid JSON';
    const directory = await runDirectory();
    const sources = ['old.html', 'new.html'].map((name) =>
      path.join(directory, name),
    );
    await Promise.all(
      sources.map((file) => writeFile(file, 'original report')),
    );

    expect(await main(['merge', ...sources])).toBe(0);
    expect(sdk.mergeReports).toHaveBeenCalledWith({ reportFiles: sources });
    const output = path.resolve('merged-report.html');
    expect(await readFile(output, 'utf8')).toContain('merged report');
    expect(launch).toHaveBeenCalledWith(pathToFileURL(output).href);
    for (const source of sources)
      expect(await readFile(source, 'utf8')).toBe('original report');
    expect(sdk.runBenchmark).not.toHaveBeenCalled();
    expect(sdk.loadTestcases).not.toHaveBeenCalled();
    expect(sdk.createReport).not.toHaveBeenCalled();
  });

  test('supports a separate output and --no-open, and preserves existing files on merge failure', async () => {
    const directory = await runDirectory();
    const sources = ['old.html', 'new.html'].map((name) =>
      path.join(directory, name),
    );
    const output = path.join(directory, 'exported', 'merged.html');
    await Promise.all(
      sources.map((file) => writeFile(file, 'original report')),
    );
    await main(['merge', ...sources, '--output', output, '--no-open']);
    expect(await readFile(output, 'utf8')).toContain('merged report');
    expect(launch).not.toHaveBeenCalled();

    sdk.mergeReports.mockRejectedValue(new Error('Testcase SHA-256 conflict'));
    await expectFailure(
      ['merge', ...sources, '--output', output],
      'Testcase SHA-256 conflict',
    );
    expect(await readFile(output, 'utf8')).toContain('merged report');
    expect(launch).not.toHaveBeenCalled();
  });

  test('rejects overwriting an input report, including symbolic and hard links', async () => {
    const directory = await runDirectory();
    const source = path.join(directory, 'source.html');
    const other = path.join(directory, 'other.html');
    await Promise.all([
      writeFile(source, 'original report'),
      writeFile(other, 'other report'),
    ]);
    const symbolic = path.join(directory, 'symbolic.html');
    const hard = path.join(directory, 'hard.html');
    await symlink(source, symbolic);
    await link(source, hard);
    for (const output of [source, symbolic, hard]) {
      await expectFailure(
        ['merge', source, other, '--output', output],
        'must not overwrite an input report',
      );
    }
    expect(await readFile(source, 'utf8')).toBe('original report');
    expect(sdk.mergeReports).not.toHaveBeenCalled();
    expect(launch).not.toHaveBeenCalled();
  });
});

describe('CLI run progress', () => {
  test('shows successful task metrics and preserves measured zero values', async () => {
    const directory = await runDirectory();
    sdk.loadTestcases.mockResolvedValue([fixture('a')]);
    sdk.runBenchmark.mockImplementationOnce(async ({ onProgress }) => {
      onProgress({
        completed: 1,
        total: 1,
        model: model.name,
        testcase: 'a',
        status: 'POINT',
        correct: true,
        attemptCount: 1,
        profiling: {
          durationMs: 0,
          totalTokens: 0,
          totalPromptTokens: 0,
          totalCompletionTokens: 0,
          calls: 0,
          usageStatus: 'complete',
        },
      });
      return { directory };
    });
    const stdout = rs.spyOn(process.stdout, 'write').mockReturnValue(true);
    const stderr = rs.spyOn(process.stderr, 'write').mockReturnValue(true);

    expect(await main(['run', '--output', directory, '--no-report'])).toBe(0);
    const output = stripVTControlCharacters(
      stdout.mock.calls.map(([message]) => message).join(''),
    ).replace(/\s+/g, ' ');
    expect(output).toMatch(/PASS\s+model\s*>\s*a/);
    expect(output).toMatch(/Duration\s+0(?:\.0+)?\s*s/);
    expect(output).toMatch(/Tokens\s+0\s*\(in\s+0\s*\/\s*out\s+0\)/);
    expect(output).toMatch(/Attempts\s+1/);
    expect(output).toMatch(/Calls\s+0/);
    expect(output).toMatch(/Evaluation completed\s*\(\d+(?:\.\d+)?\s+s\)/);
    expect(output).toContain(directory);
    expect(output).not.toContain('Model Summary');
    expect(output).not.toContain('Avg.');
    expect(output).not.toContain('Usage partial');
    expect(output).not.toContain('Usage missing');
    expect(output).not.toContain(model.apiKey);
    expect(output).not.toContain(model.baseUrl);
    expect(stderr).not.toHaveBeenCalled();
    expect(sdk.createReport).not.toHaveBeenCalled();
    expect(launch).not.toHaveBeenCalled();
  });

  test('distinguishes incorrect answers, execution errors and incomplete usage', async () => {
    const directory = await runDirectory();
    sdk.loadTestcases.mockResolvedValue([fixture('a'), fixture('b')]);
    sdk.runBenchmark.mockImplementationOnce(async ({ onProgress }) => {
      onProgress({
        completed: 1,
        total: 2,
        model: model.name,
        testcase: 'a',
        status: 'POINT',
        correct: false,
        attemptCount: 2,
        profiling: {
          durationMs: 1234,
          totalTokens: 1234,
          totalPromptTokens: 1200,
          totalCompletionTokens: 34,
          calls: 2,
          usageStatus: 'partial',
        },
      });
      onProgress({
        completed: 2,
        total: 2,
        model: model.name,
        testcase: 'b',
        status: 'ERROR',
        correct: false,
        attemptCount: 1,
        profiling: { durationMs: 0, usageStatus: 'missing' },
        error: {
          name: 'Error',
          message: 'Provider request failed [REDACTED]',
          code: '400',
          retryable: false,
        },
      });
      return { directory };
    });
    const stdout = rs.spyOn(process.stdout, 'write').mockReturnValue(true);
    const stderr = rs.spyOn(process.stderr, 'write').mockReturnValue(true);

    expect(await main(['run', '--output', directory, '--no-report'])).toBe(0);
    const output = stripVTControlCharacters(
      stdout.mock.calls.map(([message]) => message).join(''),
    ).replace(/\s+/g, ' ');
    expect(output).toMatch(/FAIL\s+model\s*>\s*a[\s\S]*ERROR\s+model\s*>\s*b/);
    expect(output).toMatch(/Duration\s+1\.23\s*s/);
    expect(output).toMatch(/Tokens\s+1,234\s*\(in\s+1,200\s*\/\s*out\s+34\)/);
    expect(output).toMatch(/Attempts\s+2/);
    expect(output).toMatch(/Calls\s+2/);
    expect(output).toContain('Usage partial');
    expect(output).toContain('Usage missing');
    expect(output).toMatch(/Tokens\s+—/);
    expect(output).toMatch(/Calls\s+—/);
    expect(output).toContain('Provider request failed [REDACTED]');
    expect(output).toContain('Evaluation completed');
    expect(output).toContain(directory);
    expect(output).not.toContain('Model Summary');
    expect(output).not.toContain('Avg.');
    expect(output).not.toContain(model.apiKey);
    expect(output).not.toContain(model.baseUrl);
    expect(stderr).not.toHaveBeenCalled();
  });
});

describe('CLI inputs', () => {
  test('help exits successfully without loading data or calling models', async () => {
    for (const args of [
      [],
      ['--help'],
      ['help', 'run'],
      ['prepare', '--help'],
      ['viewer', '--help'],
      ['run', '--help'],
      ['report', '--help'],
      ['merge', '--help'],
    ])
      expect(await main([...args])).toBe(0);
    expect(sdk.resolveDatasetDirectory).not.toHaveBeenCalled();
    expect(sdk.loadTestcases).not.toHaveBeenCalled();
    expect(sdk.runBenchmark).not.toHaveBeenCalled();
    expect(sdk.createViewer).not.toHaveBeenCalled();
    expect(sdk.createReport).not.toHaveBeenCalled();
    expect(launch).not.toHaveBeenCalled();
  });

  test('rejects the removed validate command without preparing a dataset', async () => {
    await expectFailure(['validate'], 'unknown command');
    expect(sdk.resolveDatasetDirectory).not.toHaveBeenCalled();
    expect(sdk.loadTestcases).not.toHaveBeenCalled();
  });

  test.each(['run', 'viewer'])(
    '%s stops when preparation cannot download the dataset',
    async (command) => {
      sdk.resolveDatasetDirectory.mockRejectedValue(
        new Error('Dataset download failed'),
      );

      await expectFailure([command], 'Dataset download failed');
      expect(sdk.loadTestcases).not.toHaveBeenCalled();
      expect(sdk.runBenchmark).not.toHaveBeenCalled();
      expect(sdk.createViewer).not.toHaveBeenCalled();
      expect(sdk.createReport).not.toHaveBeenCalled();
      expect(serve).not.toHaveBeenCalled();
      expect(launch).not.toHaveBeenCalled();
    },
  );

  test('viewer reports invalid datasets without opening a browser', async () => {
    sdk.loadTestcases.mockRejectedValue(
      new Error('Testcase image SHA-256 mismatch'),
    );
    await expectFailure(['viewer'], 'image SHA-256 mismatch');
    expect(sdk.createViewer).not.toHaveBeenCalled();
    expect(serve).not.toHaveBeenCalled();
    expect(launch).not.toHaveBeenCalled();
  });

  test('process configuration wins over .env, while .env supplies an absent configuration and metadata', async () => {
    const directory = await runDirectory();
    const fileModel = { ...model, name: 'from-env-file' };
    const meta = {
      models: { 'from-env-file': { displayFamily: 'Fixture', reference } },
    };
    await writeFile(
      path.join(directory, '.env'),
      `MIDSCENE_GROUNDING_EVALUATION_CONFIG='${JSON.stringify({ models: [fileModel], meta })}'\n`,
    );
    rs.spyOn(process, 'cwd').mockReturnValue(directory);
    await main(['run', '--output', directory, '--no-report']);
    expect(sdk.runBenchmark).toHaveBeenLastCalledWith(
      expect.objectContaining({ models: [model] }),
    );
    Reflect.deleteProperty(process.env, 'MIDSCENE_GROUNDING_EVALUATION_CONFIG');
    await main(['run', '--output', directory, '--no-report']);
    expect(sdk.runBenchmark).toHaveBeenLastCalledWith(
      expect.objectContaining({ models: [fileModel], meta }),
    );
  });

  test('run forwards explicit options and defaults the output root when omitted', async () => {
    const directory = await runDirectory();
    await main([
      'run',
      '--output',
      directory,
      '--testcases',
      './dataset',
      '--names',
      'WEB-v1-001',
      'MOBILE-v1-001',
      '--concurrency',
      '4',
      '--retries',
      '0',
      '--timeout-ms',
      '1200',
      '--no-report',
    ]);
    expect(sdk.loadTestcases).toHaveBeenCalledWith({
      directory: path.resolve('./dataset'),
      names: ['WEB-v1-001', 'MOBILE-v1-001'],
      onProgress: expect.any(Function),
    });
    expect(sdk.runBenchmark).toHaveBeenCalledWith(
      expect.objectContaining({
        models: [model],
        concurrency: 4,
        retries: 0,
        timeoutMs: 1200,
        outputDirectory: directory,
      }),
    );
    await main(['run', '--no-report']);
    expect(sdk.runBenchmark).toHaveBeenLastCalledWith(
      expect.objectContaining({ outputDirectory: './output' }),
    );
  });

  test('prepares testcases before rejecting invalid run concurrency', async () => {
    const directory = await runDirectory();
    await expectFailure(['run', '--output', directory, '--concurrency', '0']);
    expect(sdk.loadTestcases).toHaveBeenCalledTimes(1);
    expect(sdk.runBenchmark).not.toHaveBeenCalled();
  });

  test('rejects malformed or missing model configuration before preparing a dataset', async () => {
    const directory = await runDirectory();
    process.env.MIDSCENE_GROUNDING_EVALUATION_CONFIG = 'invalid';
    await expectFailure(['run', '--output', directory], 'valid JSON');
    process.env.MIDSCENE_GROUNDING_EVALUATION_CONFIG = '{"models":[]}';
    await expectFailure(['run', '--output', directory]);
    Reflect.deleteProperty(process.env, 'MIDSCENE_GROUNDING_EVALUATION_CONFIG');
    await expectFailure(['run', '--output', directory], 'must contain');
    expect(sdk.resolveDatasetDirectory).not.toHaveBeenCalled();
    expect(sdk.loadTestcases).not.toHaveBeenCalled();
    expect(sdk.runBenchmark).not.toHaveBeenCalled();
  });

  test('reports every model missing pricing or performance before preparing a dataset', async () => {
    const { pricing, ...referenceWithoutPricing } = reference;
    process.env.MIDSCENE_GROUNDING_EVALUATION_CONFIG = JSON.stringify({
      models: [
        { ...model, name: 'unknown-model' },
        { ...model, name: 'custom-api-id', displayName: 'Custom model' },
        { ...model, name: 'preset-api-id', displayName: 'qwen3.8-flash' },
      ],
      meta: {
        models: {
          'Custom model': { reference: referenceWithoutPricing },
          'qwen3.8-flash': {
            reference: {
              ...referenceWithoutPricing,
              pricing,
              performance: null,
            },
          },
        },
      },
    });

    const error = await expectFailure(
      ['run'],
      'Missing benchmark model metadata',
    );
    expect(error).toMatch(/unknown-model[^\n]*missing pricing and performance/);
    expect(error).toMatch(/Custom model[^\n]*missing pricing\b/);
    expect(error).toMatch(/qwen3\.8-flash[^\n]*missing performance\b/);
    expect(error).toContain('MIDSCENE_GROUNDING_EVALUATION_CONFIG');
    expect(error).toContain('meta.models');
    expect(error).not.toContain(model.apiKey);
    expect(sdk.resolveDatasetDirectory).not.toHaveBeenCalled();
    expect(sdk.loadTestcases).not.toHaveBeenCalled();
    expect(sdk.runBenchmark).not.toHaveBeenCalled();
  });

  test('uses a preset by display name and accepts custom zero prices and latency', async () => {
    const directory = await runDirectory();
    const models = [
      { ...model, name: 'different-api-id', displayName: 'qwen3.8-flash' },
      model,
    ];
    const meta = { models: { [model.name]: { reference } } };
    process.env.MIDSCENE_GROUNDING_EVALUATION_CONFIG = JSON.stringify({
      models,
      meta,
    });

    expect(await main(['run', '--output', directory, '--no-report'])).toBe(0);
    expect(sdk.runBenchmark).toHaveBeenCalledWith(
      expect.objectContaining({ models }),
    );
  });

  test('report generation is not attempted after a runner infrastructure failure', async () => {
    const directory = await runDirectory();
    sdk.runBenchmark.mockRejectedValue(new Error('Disk failure'));
    await expectFailure(['run', '--output', directory], 'Disk failure');
    expect(sdk.createReport).not.toHaveBeenCalled();
    expect(launch).not.toHaveBeenCalled();
  });
});
