import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
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
rs.mock('@midscene/benchmark-grounding', () => sdk);
rs.mock('open', () => ({ default: launch }));
import { main, writeReport } from '../cli/index';

const model = {
  name: 'model',
  family: 'gpt-6',
  baseUrl: 'https://example.com/v1',
  apiKey: 'test-only-key',
};
const temporary: string[] = [];
const environment = { ...process.env };

beforeEach(() => {
  rs.clearAllMocks();
  sdk.loadTestcases.mockResolvedValue([]);
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
  sdk.runBenchmark.mockResolvedValue({
    directory,
    summary: { planned: 1, completed: 1, models: [] },
  });
  return directory;
}

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
        concurrency: 32,
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
    await writeFile(path.join(directory, 'run.json'), '{"status":"completed"}');
    sdk.createReport.mockRejectedValue(new Error('Invalid snapshot'));
    await expect(
      main(['node', 'cli', 'run', '--output', directory]),
    ).rejects.toThrow('Invalid snapshot');
    expect(await readFile(path.join(directory, 'run.json'), 'utf8')).toBe(
      '{"status":"completed"}',
    );
    expect(launch).not.toHaveBeenCalled();
  });

  test('a report write failure does not open a browser', async () => {
    const directory = await runDirectory();
    await expect(
      writeReport({ runDirectory: directory, output: directory }),
    ).rejects.toThrow();
    expect(launch).not.toHaveBeenCalled();
  });

  test('completed model errors still generate and open the automatic report', async () => {
    const directory = await runDirectory();
    sdk.runBenchmark.mockResolvedValue({
      directory,
      summary: {
        planned: 1,
        completed: 1,
        models: [{ model: model.name, passed: 0, count: 1, errors: 1 }],
      },
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

describe('CLI inputs', () => {
  test('viewer rejects invalid ports before loading data or opening a browser', async () => {
    await expect(
      main(['node', 'cli', 'viewer', '--port', '0']),
    ).rejects.toThrow();
    expect(sdk.loadTestcases).not.toHaveBeenCalled();
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

  test('run forwards exact filters and parsed numeric options to the SDK', async () => {
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
  });

  test.each(['0', '-1', '1.5', 'NaN'])(
    'rejects invalid concurrency %s before loading data',
    async (concurrency) => {
      const directory = await runDirectory();
      await expect(
        main([
          'node',
          'cli',
          'run',
          '--output',
          directory,
          '--concurrency',
          concurrency,
        ]),
      ).rejects.toThrow();
      expect(sdk.loadTestcases).not.toHaveBeenCalled();
      expect(sdk.runBenchmark).not.toHaveBeenCalled();
    },
  );

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
