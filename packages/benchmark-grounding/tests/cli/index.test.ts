import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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

const sdk = rs.hoisted(() => ({
  loadTestcases: rs.fn(),
  createViewer: rs.fn(),
  createReport: rs.fn(),
  runBenchmark: rs.fn(),
}));
const launch = rs.hoisted(() => rs.fn());
const terminalLink = rs.hoisted(() =>
  rs.fn(
    (text: string, _url: string, _options: { fallback: () => string }) => text,
  ),
);
rs.mock('@midscene/benchmark-grounding', () => sdk);
rs.mock('open', () => ({ default: launch }));
rs.mock('terminal-link', () => ({ default: terminalLink }));
import { main } from '../../cli/index';
import { fixture } from '../fixture';

const model = {
  name: 'model',
  family: 'gpt-6',
  baseUrl: 'https://example.com/v1',
  apiKey: 'test-only-key',
};
const temporary: string[] = [];
const environment = { ...process.env };

beforeEach(async () => {
  rs.clearAllMocks();
  terminalLink.mockImplementation((text) => text);
  rs.spyOn(process.stdout, 'write').mockReturnValue(true);
  rs.spyOn(process.stderr, 'write').mockReturnValue(true);
  const directory = await mkdtemp(path.join(os.tmpdir(), 'benchmark-cli-cwd-'));
  temporary.push(directory);
  rs.spyOn(process, 'cwd').mockReturnValue(directory);
  sdk.loadTestcases.mockResolvedValue([fixture()]);
  sdk.createReport.mockResolvedValue(
    '<!doctype html><html>saved report</html>',
  );
  launch.mockResolvedValue(undefined);
  process.env.MIDSCENE_GROUNDING_EVALUATION_CONFIG = JSON.stringify({
    models: [model],
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

describe('CLI validation', () => {
  test('validates bundled or selected testcases without model configuration or other side effects', async () => {
    process.env.MIDSCENE_GROUNDING_EVALUATION_CONFIG = 'invalid JSON';
    const records = [fixture('a'), fixture('b')];
    sdk.loadTestcases.mockImplementation(async ({ onProgress }) => {
      for (const record of records)
        onProgress({
          name: record.testcase.name,
          testcaseSha256: record.testcaseSha256,
        });
      return records;
    });
    const stdout = rs.spyOn(process.stdout, 'write').mockReturnValue(true);
    const stderr = rs.spyOn(process.stderr, 'write').mockReturnValue(true);

    expect(await main(['node', 'cli', 'validate'])).toBe(0);
    expect(sdk.loadTestcases).toHaveBeenLastCalledWith({
      directory: undefined,
      names: undefined,
      onProgress: expect.any(Function),
    });
    const output = stripVTControlCharacters(
      stdout.mock.calls.map(([message]) => message).join(''),
    );
    expect(output).toContain('VALIDATE');
    expect(output).toContain('Midscene Grounding Benchmark');
    expect(output).toContain(
      'Checking testcase data, hashes, screenshots and ground truth.',
    );
    expect(output).toMatch(
      /PASS\s+a[\s\S]*PASS\s+b[\s\S]*Validation complete: 2 passed, 0 failed \(2 total\)\./,
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
        new URL(`../testcases/${testcase.name}/index.json`, import.meta.url)
          .href,
        { fallback: expect.any(Function) },
      ]),
    );

    await main([
      'node',
      'cli',
      'validate',
      '--testcases',
      './dataset 中文',
      '--names',
      'a',
      'b',
    ]);
    expect(sdk.loadTestcases).toHaveBeenLastCalledWith({
      directory: './dataset 中文',
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
  });

  test('reports all validation outcomes and throws only the failure summary', async () => {
    terminalLink.mockImplementation((_text, _url, options) =>
      options.fallback(),
    );
    const filenames = ['a', 'b', 'c', 'd'].map((name) =>
      fileURLToPath(
        new URL(`../testcases/${name}/index.json`, import.meta.url),
      ),
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
      onProgress({ name: 'a', error: errors[0] });
      onProgress({ name: 'b', testcaseSha256: fixture('b').testcaseSha256 });
      onProgress({ name: 'c', error: errors[1] });
      onProgress({ name: 'd', testcaseSha256: fixture('d').testcaseSha256 });
      throw new AggregateError(
        errors,
        `${summary}\n${errors.map((error) => error.message).join('\n')}`,
      );
    });
    const stdout = rs.spyOn(process.stdout, 'write').mockReturnValue(true);
    const stderr = rs.spyOn(process.stderr, 'write').mockReturnValue(true);

    await expect(main(['node', 'cli', 'validate'])).rejects.toMatchObject({
      message: summary,
    });
    const output = stripVTControlCharacters(
      stdout.mock.calls.map(([message]) => message).join(''),
    );
    expect(output).toContain('VALIDATE');
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
        new URL(`../testcases/${name}/index.json`, import.meta.url).href,
        { fallback: expect.any(Function) },
      ]),
    );
    for (const [, url, options] of terminalLink.mock.calls)
      expect(options.fallback()).toBe(fileURLToPath(url));
    expect(output).not.toContain('Validation complete:');
    expect(output).not.toContain('ENOENT');
    expect(stderr).not.toHaveBeenCalled();
  });

  test('propagates directory errors without reporting successful validation', async () => {
    sdk.loadTestcases.mockRejectedValue(
      new Error('Cannot read testcase directory: /missing'),
    );
    const stdout = rs.spyOn(process.stdout, 'write').mockReturnValue(true);
    const stderr = rs.spyOn(process.stderr, 'write').mockReturnValue(true);

    await expect(
      main(['node', 'cli', 'validate', '--testcases', '/missing']),
    ).rejects.toThrow('Cannot read testcase directory: /missing');
    const output = stripVTControlCharacters(
      stdout.mock.calls.map(([message]) => message).join(''),
    );
    expect(output).toContain('VALIDATE');
    expect(output).toContain('Midscene Grounding Benchmark');
    expect(output).not.toMatch(/\b(?:PASS|FAIL)\b|Validation complete:/);
    expect(terminalLink).not.toHaveBeenCalled();
    expect(stderr).not.toHaveBeenCalled();
  });
});

describe('CLI report workflow', () => {
  test('run generates the same report as standalone report and opens it by default', async () => {
    const directory = await runDirectory();
    expect(await main(['node', 'cli', 'run', '--output', directory])).toBe(0);
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
    await main(['node', 'cli', 'report', directory]);
    expect(await readFile(filename, 'utf8')).toBe(automatic);
    expect(launch).toHaveBeenCalledTimes(2);
  });

  test('--no-report skips both generation and browser opening', async () => {
    const directory = await runDirectory();
    await main(['node', 'cli', 'run', '--output', directory, '--no-report']);
    expect(sdk.createReport).not.toHaveBeenCalled();
    expect(launch).not.toHaveBeenCalled();
    await expect(
      readFile(path.join(directory, 'report.html')),
    ).rejects.toThrow();
  });

  test('--no-open still generates the report for run and report', async () => {
    const directory = await runDirectory();
    await main(['node', 'cli', 'run', '--output', directory, '--no-open']);
    await main(['node', 'cli', 'report', directory, '--no-open']);
    expect(sdk.createReport).toHaveBeenCalledTimes(2);
    expect(launch).not.toHaveBeenCalled();
  });

  test('a generation failure preserves run artifacts and does not open a browser', async () => {
    const directory = await runDirectory();
    await writeFile(path.join(directory, 'meta.json'), '{"models":{}}');
    sdk.createReport.mockRejectedValue(new Error('Invalid snapshot'));
    await expect(
      main(['node', 'cli', 'run', '--output', directory]),
    ).rejects.toThrow('Invalid snapshot');
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
    expect(await main(['node', 'cli', 'run', '--output', directory])).toBe(0);
    expect(sdk.createReport).toHaveBeenCalledWith({ runDirectory: directory });
    expect(launch).toHaveBeenCalledTimes(1);
  });

  test('browser failure keeps the generated file and does not fail the command', async () => {
    const directory = await runDirectory();
    launch.mockRejectedValue(new Error('No browser available'));
    expect(await main(['node', 'cli', 'report', directory])).toBe(0);
    expect(
      await readFile(path.join(directory, 'report.html'), 'utf8'),
    ).toContain('saved report');
  });

  test('standalone report needs no model environment variable and supports an output file', async () => {
    const directory = await runDirectory();
    process.env.MIDSCENE_GROUNDING_EVALUATION_CONFIG = 'invalid JSON';
    const filename = path.join(directory, 'exported', 'report.html');
    await main([
      'node',
      'cli',
      'report',
      directory,
      '--output',
      filename,
      '--no-open',
    ]);
    expect(await readFile(filename, 'utf8')).toContain('saved report');
    expect(sdk.runBenchmark).not.toHaveBeenCalled();
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

    expect(
      await main(['node', 'cli', 'run', '--output', directory, '--no-report']),
    ).toBe(0);
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

    expect(
      await main(['node', 'cli', 'run', '--output', directory, '--no-report']),
    ).toBe(0);
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
    for (const args of [[], ['--help'], ['help', 'run'], ['run', '--help']])
      expect(await main(['node', 'cli', ...args])).toBe(0);
    expect(sdk.loadTestcases).not.toHaveBeenCalled();
    expect(sdk.runBenchmark).not.toHaveBeenCalled();
    expect(sdk.createViewer).not.toHaveBeenCalled();
    expect(sdk.createReport).not.toHaveBeenCalled();
    expect(launch).not.toHaveBeenCalled();
  });

  test('viewer reports invalid datasets without opening a browser', async () => {
    sdk.loadTestcases.mockRejectedValue(
      new Error('Testcase image SHA-256 mismatch'),
    );
    await expect(main(['node', 'cli', 'viewer'])).rejects.toThrow(
      'image SHA-256 mismatch',
    );
    expect(sdk.createViewer).not.toHaveBeenCalled();
    expect(launch).not.toHaveBeenCalled();
  });

  test('process configuration wins over .env, while .env supplies an absent configuration and metadata', async () => {
    const directory = await runDirectory();
    const fileModel = { ...model, name: 'from-env-file' };
    const meta = { models: { 'from-env-file': { displayFamily: 'Fixture' } } };
    await writeFile(
      path.join(directory, '.env'),
      `MIDSCENE_GROUNDING_EVALUATION_CONFIG='${JSON.stringify({ models: [fileModel], meta })}'\n`,
    );
    rs.spyOn(process, 'cwd').mockReturnValue(directory);
    await main(['node', 'cli', 'run', '--output', directory, '--no-report']);
    expect(sdk.runBenchmark).toHaveBeenLastCalledWith(
      expect.objectContaining({ models: [model] }),
    );
    Reflect.deleteProperty(process.env, 'MIDSCENE_GROUNDING_EVALUATION_CONFIG');
    await main(['node', 'cli', 'run', '--output', directory, '--no-report']);
    expect(sdk.runBenchmark).toHaveBeenLastCalledWith(
      expect.objectContaining({ models: [fileModel], meta }),
    );
  });

  test('run forwards explicit options and defaults the output root when omitted', async () => {
    const directory = await runDirectory();
    await main([
      'node',
      'cli',
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
      directory: './dataset',
      names: ['WEB-v1-001', 'MOBILE-v1-001'],
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
    await main(['node', 'cli', 'run', '--no-report']);
    expect(sdk.runBenchmark).toHaveBeenLastCalledWith(
      expect.objectContaining({ outputDirectory: './output' }),
    );
  });

  test('rejects invalid concurrency before loading data', async () => {
    const directory = await runDirectory();
    await expect(
      main(['node', 'cli', 'run', '--output', directory, '--concurrency', '0']),
    ).rejects.toThrow();
    expect(sdk.loadTestcases).not.toHaveBeenCalled();
    expect(sdk.runBenchmark).not.toHaveBeenCalled();
  });

  test('rejects malformed or missing model configuration before calling models', async () => {
    const directory = await runDirectory();
    process.env.MIDSCENE_GROUNDING_EVALUATION_CONFIG = 'invalid';
    await expect(
      main(['node', 'cli', 'run', '--output', directory]),
    ).rejects.toThrow('valid JSON');
    process.env.MIDSCENE_GROUNDING_EVALUATION_CONFIG = '{"models":[]}';
    await expect(
      main(['node', 'cli', 'run', '--output', directory]),
    ).rejects.toThrow();
    Reflect.deleteProperty(process.env, 'MIDSCENE_GROUNDING_EVALUATION_CONFIG');
    await expect(
      main(['node', 'cli', 'run', '--output', directory]),
    ).rejects.toThrow('must contain');
    expect(sdk.runBenchmark).not.toHaveBeenCalled();
  });

  test('report generation is not attempted after a runner infrastructure failure', async () => {
    const directory = await runDirectory();
    sdk.runBenchmark.mockRejectedValue(new Error('Disk failure'));
    await expect(
      main(['node', 'cli', 'run', '--output', directory]),
    ).rejects.toThrow('Disk failure');
    expect(sdk.createReport).not.toHaveBeenCalled();
    expect(launch).not.toHaveBeenCalled();
  });
});
