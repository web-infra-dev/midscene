import type { CliOutput } from '@/run-cli';
import { beforeEach, describe, expect, rs, test } from '@rstest/core';

const mocks = rs.hoisted(() => ({
  createConfig: rs.fn(),
  createFilesConfig: rs.fn(),
  loadDotenvConfig: rs.fn(),
  matchYamlFiles: rs.fn(),
  parseProcessArgs: rs.fn(),
  runFrameworkTestConfigDetailed: rs.fn(),
}));

rs.mock('@/cli-utils', () => ({
  matchYamlFiles: mocks.matchYamlFiles,
  parseProcessArgs: mocks.parseProcessArgs,
}));

rs.mock('@/config-factory', () => ({
  createConfig: mocks.createConfig,
  createFilesConfig: mocks.createFilesConfig,
}));

rs.mock('@/dotenv-loader', () => ({
  loadDotenvConfig: mocks.loadDotenvConfig,
}));

rs.mock('@/framework/command', () => ({
  JSON_KEEP_WINDOW_ERROR:
    'JSON output mode cannot be used when keepWindow is enabled because the command does not terminate.',
  runFrameworkTestConfigDetailed: mocks.runFrameworkTestConfigDetailed,
}));

import { runCli } from '@/run-cli';

const createOutput = (): CliOutput => ({
  log: rs.fn(),
  error: rs.fn(),
  writeJson: rs.fn(),
});

const config = {
  files: ['/tmp/case.yaml'],
  concurrent: 1,
  continueOnError: false,
  retry: 0,
  summary: 'summary.json',
  shareBrowserContext: false,
  headed: false,
  keepWindow: false,
  dotenvOverride: false,
  dotenvDebug: false,
  globalConfig: {},
};

describe('runCli', () => {
  beforeEach(() => {
    rs.clearAllMocks();
  });

  test('emits only the structured run result through the JSON output boundary', async () => {
    const output = createOutput();
    let finishJsonWrite: (() => void) | undefined;
    const jsonWrite = new Promise<void>((resolve) => {
      finishJsonWrite = resolve;
    });
    output.writeJson = rs.fn(() => jsonWrite);
    mocks.parseProcessArgs.mockResolvedValue({
      options: { json: true },
      path: 'case.yaml',
    });
    mocks.matchYamlFiles.mockResolvedValue(['/tmp/case.yaml']);
    mocks.createFilesConfig.mockResolvedValue(config);
    mocks.runFrameworkTestConfigDetailed.mockResolvedValue({
      exitCode: 0,
      results: [
        {
          file: '/tmp/case.yaml',
          success: true,
          executed: true,
          duration: 5,
          resultType: 'success',
        },
      ],
      summaryPath: '/tmp/midscene_run/output/summary.json',
    });

    const runPromise = runCli(['case.yaml', '--json'], output);
    await new Promise<void>((resolve) => setImmediate(resolve));

    let runFinished = false;
    void runPromise.then(() => {
      runFinished = true;
    });
    await Promise.resolve();
    expect(runFinished).toBe(false);

    expect(output.log).not.toHaveBeenCalled();
    expect(output.error).not.toHaveBeenCalled();
    expect(output.writeJson).toHaveBeenCalledWith({
      schemaVersion: 1,
      kind: 'run',
      ok: true,
      exitCode: 0,
      summary: {
        path: '/tmp/midscene_run/output/summary.json',
        total: 1,
        successful: 1,
        failed: 0,
        partialFailed: 0,
        notExecuted: 0,
        totalDuration: 5,
      },
      results: [
        {
          file: '/tmp/case.yaml',
          success: true,
          executed: true,
          resultType: 'success',
          duration: 5,
          error: null,
          report: null,
          outputPath: null,
          output: null,
        },
      ],
    });
    expect(mocks.runFrameworkTestConfigDetailed).toHaveBeenCalledWith(config, {
      outputMode: 'json',
    });

    finishJsonWrite?.();
    await expect(runPromise).resolves.toEqual({
      exitCode: 0,
      termination: 'force',
    });
  });

  test('preserves the existing human output path when JSON is disabled', async () => {
    const output = createOutput();
    mocks.parseProcessArgs.mockResolvedValue({
      options: {},
      path: 'case.yaml',
    });
    mocks.matchYamlFiles.mockResolvedValue(['/tmp/case.yaml']);
    mocks.createFilesConfig.mockResolvedValue(config);
    mocks.runFrameworkTestConfigDetailed.mockResolvedValue({
      exitCode: 0,
      results: [],
      summaryPath: '/tmp/midscene_run/output/summary.json',
    });

    await expect(runCli(['case.yaml'], output)).resolves.toEqual({
      exitCode: 0,
      termination: 'force',
    });

    expect(output.log).toHaveBeenCalledWith(
      expect.stringContaining('Welcome to @midscene/cli'),
    );
    expect(output.log).toHaveBeenCalledWith('   Executing YAML files...');
    expect(output.error).not.toHaveBeenCalled();
    expect(output.writeJson).not.toHaveBeenCalled();
    expect(mocks.loadDotenvConfig).toHaveBeenCalledWith({
      dotenvDebug: false,
      dotenvOverride: false,
      log: output.log,
    });
    expect(mocks.runFrameworkTestConfigDetailed).toHaveBeenCalledWith(config, {
      outputMode: 'human',
    });
  });

  test('prints expected human CLI errors without a stack trace', async () => {
    const output = createOutput();
    mocks.parseProcessArgs.mockResolvedValue({
      options: {},
    });

    await expect(runCli([], output)).resolves.toEqual({
      exitCode: 1,
      termination: 'force',
    });

    expect(output.error).toHaveBeenCalledWith(
      'No script path, files, or config provided',
    );
    expect(output.writeJson).not.toHaveBeenCalled();
  });

  test('lets report-tool exit naturally so its stdout can flush', async () => {
    const output = createOutput();
    const consoleLog = rs.spyOn(console, 'log').mockImplementation(() => {});

    try {
      await expect(runCli(['report-tool', '--help'], output)).resolves.toEqual({
        exitCode: 0,
        termination: 'natural',
      });
    } finally {
      consoleLog.mockRestore();
    }
  });

  test('emits a structured error when argument parsing fails in JSON mode', async () => {
    const output = createOutput();
    mocks.parseProcessArgs.mockRejectedValue(new Error('invalid arguments'));

    await expect(runCli(['--json'], output)).resolves.toEqual({
      exitCode: 1,
      termination: 'force',
    });

    expect(output.log).not.toHaveBeenCalled();
    expect(output.error).not.toHaveBeenCalled();
    expect(output.writeJson).toHaveBeenCalledWith({
      schemaVersion: 1,
      kind: 'error',
      ok: false,
      exitCode: 1,
      error: {
        name: 'Error',
        message: 'invalid arguments',
      },
    });
  });

  test.each([
    {
      name: 'dotenv debug logging',
      configOverride: { dotenvDebug: true },
      message:
        '--json cannot be used with --dotenv-debug because dotenv debug logs are not machine-readable.',
    },
    {
      name: 'keepWindow',
      configOverride: { keepWindow: true },
      message:
        'JSON output mode cannot be used when keepWindow is enabled because the command does not terminate.',
    },
  ])('rejects $name in JSON mode', async ({ configOverride, message }) => {
    const output = createOutput();
    mocks.parseProcessArgs.mockResolvedValue({
      options: { json: true },
      path: 'case.yaml',
    });
    mocks.matchYamlFiles.mockResolvedValue(['/tmp/case.yaml']);
    mocks.createFilesConfig.mockResolvedValue({
      ...config,
      ...configOverride,
    });

    await expect(runCli(['case.yaml', '--json'], output)).resolves.toEqual({
      exitCode: 1,
      termination: 'force',
    });

    expect(mocks.loadDotenvConfig).not.toHaveBeenCalled();
    expect(mocks.runFrameworkTestConfigDetailed).not.toHaveBeenCalled();
    expect(output.writeJson).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ message }),
      }),
    );
  });
});
