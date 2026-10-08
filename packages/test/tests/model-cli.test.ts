import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runTestCli } from '../src/cli/test-command';

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  config: vi.fn(),
  dotenv: vi.fn(),
}));

vi.mock('@midscene/core', () => ({ runConnectivityTest: mocks.verify }));
vi.mock('../src/cli/test-project', () => ({ loadTestProject: vi.fn() }));
vi.mock('../src/cli/test-project-runner', () => ({
  DEFAULT_TEST_FILE_SELECTION: [],
  discoverTestConfig: vi.fn(),
  runTestProject: vi.fn(),
}));
vi.mock('../src/cli/node-spec', () => ({
  renderNodeSpec: vi.fn(),
  sortNodesForSpec: vi.fn(),
}));
vi.mock('@midscene/shared/env', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@midscene/shared/env')>()),
  globalModelConfigManager: { getModelConfig: mocks.config },
}));
vi.mock('../src/cli/dotenv-loader', () => ({
  loadDotenvConfig: mocks.dotenv,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.config.mockImplementation((intent) => ({ modelName: intent }));
  mocks.verify.mockResolvedValue({ passed: true });
});

const createIO = () => ({ log: vi.fn(), error: vi.fn() });

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
      planningModelConfig: { modelName: 'planning' },
      insightModelConfig: { modelName: 'insight' },
    });
    expect(io.log).toHaveBeenCalledWith('✅ Model verify passed.');
  });

  it('returns a failing exit code and diagnostics', async () => {
    mocks.verify.mockResolvedValue({
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
