import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Mock dependencies
vi.mock('dotenv', () => ({
  config: vi.fn(),
}));

vi.mock('../../../src/ts-runner/agent-factory', () => ({
  launchAgent: vi.fn(),
  connectAgent: vi.fn(),
  cleanup: vi.fn(),
}));

// Mock process.argv and process.exit
const originalArgv = process.argv;
const originalExit = process.exit;
const originalConsoleError = console.error;
const originalConsoleLog = console.log;

describe('runner.ts', () => {
  let launchAgentMock: any;
  let connectAgentMock: any;
  let cleanupMock: any;
  let processExitMock: any;
  let consoleErrorMock: any;
  let consoleLogMock: any;
  let agentMock: any;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    // Setup agent mock
    agentMock = {
      aiAct: vi.fn().mockResolvedValue('result'),
    };

    // Setup factory function mocks
    const agentFactory = await import('../../../src/ts-runner/agent-factory');
    launchAgentMock = vi.mocked(agentFactory.launchAgent);
    connectAgentMock = vi.mocked(agentFactory.connectAgent);
    cleanupMock = vi.mocked(agentFactory.cleanup);

    launchAgentMock.mockResolvedValue(agentMock);
    connectAgentMock.mockResolvedValue(agentMock);
    cleanupMock.mockResolvedValue(undefined);

    // Setup process mocks
    processExitMock = vi.fn();
    process.exit = processExitMock as any;
    consoleErrorMock = vi.fn();
    console.error = consoleErrorMock;
    consoleLogMock = vi.fn();
    console.log = consoleLogMock;
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.exit = originalExit as any;
    console.error = originalConsoleError;
    console.log = originalConsoleLog;
    vi.unstubAllGlobals();
  });

  test('should launch browser with default options', async () => {
    const { run } = await import('../../../src/ts-runner/runner');
    const scriptPath = resolve(__dirname, 'fixtures/script-basic.mts');
    process.argv = ['node', 'runner.js', scriptPath];

    await run(scriptPath);

    expect(launchAgentMock).toHaveBeenCalledWith({
      headed: false,
    });
    expect((globalThis as any).agent).toBe(agentMock);
  });

  test('should launch browser with --headed flag', async () => {
    const { run } = await import('../../../src/ts-runner/runner');
    const scriptPath = resolve(__dirname, 'fixtures/script-basic.mts');
    process.argv = ['node', 'runner.js', scriptPath, '--headed'];

    await run(scriptPath);

    expect(launchAgentMock).toHaveBeenCalledWith({
      headed: true,
    });
  });

  test('should launch browser with --url option', async () => {
    const { run } = await import('../../../src/ts-runner/runner');
    const scriptPath = resolve(__dirname, 'fixtures/script-basic.mts');
    process.argv = [
      'node',
      'runner.js',
      scriptPath,
      '--url',
      'https://example.com',
    ];

    await run(scriptPath);

    expect(launchAgentMock).toHaveBeenCalledWith({
      headed: false,
      url: 'https://example.com',
    });
  });

  test('should launch browser with --viewport option', async () => {
    const { run } = await import('../../../src/ts-runner/runner');
    const scriptPath = resolve(__dirname, 'fixtures/script-basic.mts');
    process.argv = ['node', 'runner.js', scriptPath, '--viewport', '1920x1080'];

    await run(scriptPath);

    expect(launchAgentMock).toHaveBeenCalledWith({
      headed: false,
      viewport: { width: 1920, height: 1080 },
    });
  });

  test('should connect to browser with --cdp option', async () => {
    const { run } = await import('../../../src/ts-runner/runner');
    const scriptPath = resolve(__dirname, 'fixtures/script-basic.mts');
    process.argv = [
      'node',
      'runner.js',
      scriptPath,
      '--cdp',
      'ws://localhost:9222/devtools/browser/abc123',
    ];

    await run(scriptPath);

    expect(connectAgentMock).toHaveBeenCalledWith({
      endpoint: 'ws://localhost:9222/devtools/browser/abc123',
    });
    expect(launchAgentMock).not.toHaveBeenCalled();
  });

  test('should connect with --api-key option', async () => {
    const { run } = await import('../../../src/ts-runner/runner');
    const scriptPath = resolve(__dirname, 'fixtures/script-basic.mts');
    process.argv = [
      'node',
      'runner.js',
      scriptPath,
      '--cdp',
      'wss://connect.browserbase.com',
      '--api-key',
      'test-key',
    ];

    await run(scriptPath);

    expect(connectAgentMock).toHaveBeenCalledWith({
      endpoint: 'wss://connect.browserbase.com',
      apiKey: 'test-key',
    });
  });

  test('should connect with --tab-url option', async () => {
    const { run } = await import('../../../src/ts-runner/runner');
    const scriptPath = resolve(__dirname, 'fixtures/script-basic.mts');
    process.argv = [
      'node',
      'runner.js',
      scriptPath,
      '--cdp',
      'ws://localhost:9222',
      '--tab-url',
      'example.com',
    ];

    await run(scriptPath);

    expect(connectAgentMock).toHaveBeenCalledWith({
      endpoint: 'ws://localhost:9222',
      tabUrl: 'example.com',
    });
  });

  test('should handle run function export', async () => {
    const { run } = await import('../../../src/ts-runner/runner');
    const scriptPath = resolve(__dirname, 'fixtures/script-basic.mts');
    process.argv = ['node', 'runner.js', scriptPath];

    const fixtureModule = await import(scriptPath);
    const runSpy = vi.spyOn(fixtureModule, 'run');

    await run(scriptPath);

    expect(runSpy).toHaveBeenCalled();
  });

  test('should handle no exports (top-level await style)', async () => {
    const { run } = await import('../../../src/ts-runner/runner');
    const scriptPath = resolve(__dirname, 'fixtures/script-top-level.mts');
    process.argv = ['node', 'runner.js', scriptPath];

    await run(scriptPath);

    expect(launchAgentMock).toHaveBeenCalled();
  });

  test('should throw error when no script path provided', async () => {
    process.argv = ['node', 'runner.js'];
    const { run } = await import('../../../src/ts-runner/runner');

    await expect(run()).rejects.toThrow(
      'Usage: midscene <script.ts> [options]',
    );
  });

  test('should cleanup on beforeExit', async () => {
    await import('../../../src/ts-runner/runner');

    process.emit('beforeExit');

    await new Promise((resolve) => setImmediate(resolve));

    expect(cleanupMock).toHaveBeenCalled();
  });

  test('should cleanup and exit on uncaughtException', async () => {
    await import('../../../src/ts-runner/runner');
    const error = new Error('Test error');

    process.emit('uncaughtException', error);

    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    expect(consoleErrorMock).toHaveBeenCalledWith('Uncaught Exception:', error);
    expect(processExitMock).toHaveBeenCalledWith(1);
  });

  test('should cleanup and exit on unhandledRejection', async () => {
    await import('../../../src/ts-runner/runner');
    const reason = new Error('Test rejection');

    process.emit('unhandledRejection', reason);

    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    expect(consoleErrorMock).toHaveBeenCalledWith(
      'Unhandled Rejection:',
      reason,
    );
    expect(processExitMock).toHaveBeenCalledWith(1);
  });
});
