import * as actualEnv from '@midscene/shared/env' with {
  rstest: 'importActual',
};
import { beforeEach, describe, expect, it, rs } from '@rstest/core';
import { runTestCli } from '../src/cli/test-command';

const mocks = rs.hoisted(() => ({
  verify: rs.fn(),
  config: rs.fn(),
  dotenv: rs.fn(),
}));

rs.mock('@midscene/core', () => ({ runConnectivityTest: mocks.verify }));
rs.mock('../src/cli/test-project', () => ({ loadTestProject: rs.fn() }));
rs.mock('../src/cli/test-project-runner', () => ({
  DEFAULT_TEST_FILE_SELECTION: [],
  discoverTestConfig: rs.fn(),
  runTestProject: rs.fn(),
}));
rs.mock('../src/cli/node-spec', () => ({
  renderNodeSpec: rs.fn(),
  sortNodesForSpec: rs.fn(),
}));
rs.mock('@midscene/shared/env', () => ({
  ...actualEnv,
  globalModelConfigManager: { getModelConfig: mocks.config },
}));
rs.mock('../src/cli/dotenv-loader', () => ({
  loadDotenvConfig: mocks.dotenv,
}));

beforeEach(() => {
  rs.clearAllMocks();
  mocks.config.mockImplementation((intent) => ({ modelName: intent }));
  mocks.verify.mockResolvedValue({ checks: [], requestCount: 0, passed: true });
});

const createIO = () => ({ log: rs.fn(), error: rs.fn() });

describe('midscene-test model CLI', () => {
  it.each([['--help'], ['-h']])(
    'lists verification in top-level help: %s',
    async (flag) => {
      const io = createIO();
      expect(await runTestCli([flag], io)).toBe(0);
      expect(io.log).toHaveBeenCalledWith(
        expect.stringContaining('midscene-test model verify'),
      );
      expect(mocks.verify).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['model'],
    ['model', '--help'],
    ['model', 'verify', '--help'],
    ['model', 'verify', '-h'],
  ])('shows model help without calling the model: %j', async (...args) => {
    const io = createIO();
    expect(await runTestCli(args, io)).toBe(0);
    expect(io.log).toHaveBeenCalledWith(
      expect.stringContaining('Midscene compatibility'),
    );
    expect(mocks.dotenv).not.toHaveBeenCalled();
    expect(mocks.verify).not.toHaveBeenCalled();
  });

  it('routes verify to all model configurations without loading a Test project', async () => {
    const io = createIO();
    expect(await runTestCli(['model', 'verify'], io)).toBe(0);
    expect(mocks.dotenv).toHaveBeenCalledWith({
      dotenvDebug: true,
      dotenvOverride: true,
      log: io.log,
    });
    expect(mocks.verify).toHaveBeenCalledWith({
      defaultModelConfig: { modelName: 'default' },
      locateModelConfig: { modelName: 'locate' },
      planningModelConfig: { modelName: 'planning' },
      insightModelConfig: { modelName: 'insight' },
    });
    expect(io.log).toHaveBeenCalledWith('✅ Model verify passed.');
  });

  it('returns a failing exit code and diagnostics', async () => {
    mocks.verify.mockResolvedValue({
      checks: [],
      requestCount: 0,
      passed: false,
      message: 'Connection failed',
    });
    const io = createIO();
    expect(await runTestCli(['model', 'verify'], io)).toBe(1);
    expect(io.error).toHaveBeenCalledWith(
      expect.stringContaining('Connection failed'),
    );
  });

  it('reports configuration errors', async () => {
    mocks.config.mockImplementation(() => {
      throw new Error('Missing model name');
    });
    const io = createIO();
    expect(await runTestCli(['model', 'verify'], io)).toBe(1);
    expect(io.error).toHaveBeenCalledWith(
      expect.stringContaining('Missing model name'),
    );
    expect(mocks.verify).not.toHaveBeenCalled();
  });

  it.each([
    ['model', 'unknown'],
    ['model', 'verify', '--config', 'midscene.config.ts'],
  ])('rejects unsupported arguments: %j', async (...args) => {
    const io = createIO();
    expect(await runTestCli(args, io)).toBe(1);
    expect(io.error).toHaveBeenCalledWith(
      expect.stringContaining('midscene-test model'),
    );
    expect(mocks.verify).not.toHaveBeenCalled();
  });
});
