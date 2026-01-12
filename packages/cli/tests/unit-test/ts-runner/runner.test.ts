import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Mock dependencies
vi.mock('dotenv', () => ({
  config: vi.fn(),
}));

vi.mock('../../../src/ts-runner/agent-proxy', () => ({
  AgentProxy: vi.fn(),
}));

// Mock process.argv and process.exit
const originalArgv = process.argv;
const originalExit = process.exit;
const originalConsoleError = console.error;

describe('runner.ts', () => {
  let AgentProxyMock: any;
  let agentInstanceMock: any;
  let processExitMock: any;
  let consoleErrorMock: any;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    // Setup AgentProxy mock
    agentInstanceMock = {
      launch: vi.fn().mockResolvedValue(undefined),
      connect: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn().mockResolvedValue(undefined),
    };
    AgentProxyMock = vi.fn(() => agentInstanceMock);
    vi.mocked(await import('../../../src/ts-runner/agent-proxy')).AgentProxy =
      AgentProxyMock;

    // Setup process mocks
    processExitMock = vi.fn();
    process.exit = processExitMock as any;
    consoleErrorMock = vi.fn();
    console.error = consoleErrorMock;
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.exit = originalExit as any;
    console.error = originalConsoleError;
    vi.unstubAllGlobals();
  });

  test('should create AgentProxy instance and set global agent', async () => {
    await import('../../../src/ts-runner/runner.js');

    expect(AgentProxyMock).toHaveBeenCalledTimes(1);
    expect((globalThis as any).agent).toBe(agentInstanceMock);
  });

  test('should call run function with agent and run calls launch', async () => {
    const { run } = await import('../../../src/ts-runner/runner.js');
    const scriptPath = resolve(__dirname, 'fixtures/script-with-launch.mts');

    await run(scriptPath);

    // run function should be called with agent, which then calls launch
    expect(agentInstanceMock.launch).toHaveBeenCalledWith({
      headed: false,
      url: 'https://example.com',
    });
    expect(agentInstanceMock.connect).not.toHaveBeenCalled();
  });

  test('should call run function with agent and run calls connect', async () => {
    const { run } = await import('../../../src/ts-runner/runner.js');
    const scriptPath = resolve(__dirname, 'fixtures/script-with-cdp.mts');

    await run(scriptPath);

    // run function should be called with agent, which then calls connect
    expect(agentInstanceMock.connect).toHaveBeenCalledWith(
      'ws://localhost:9222/devtools/browser/abc123',
    );
    expect(agentInstanceMock.launch).not.toHaveBeenCalled();
  });

  test('should handle run function export', async () => {
    const { run } = await import('../../../src/ts-runner/runner.js');
    const scriptPath = resolve(__dirname, 'fixtures/script-with-launch.mts');

    // Import the fixture to spy on its run function
    const fixtureModule = await import(scriptPath);
    const runSpy = vi.spyOn(fixtureModule, 'run');

    await run(scriptPath);

    // run function uses global agent, no parameter passed
    expect(runSpy).toHaveBeenCalledWith();
  });

  test('should handle no exports (top-level await style)', async () => {
    const { run } = await import('../../../src/ts-runner/runner.js');
    const scriptPath = resolve(__dirname, 'fixtures/script-top-level.mts');

    await run(scriptPath);

    // No run function exported, so nothing should be called
    expect(agentInstanceMock.launch).not.toHaveBeenCalled();
    expect(agentInstanceMock.connect).not.toHaveBeenCalled();
  });

  test('should exit with error when no script path provided', async () => {
    process.argv = ['node', 'runner.js'];
    const { run } = await import('../../../src/ts-runner/runner.js');

    await run();

    expect(consoleErrorMock).toHaveBeenCalledWith(
      'Usage: midscene <script.ts>',
    );
    expect(processExitMock).toHaveBeenCalledWith(1);
  });

  test('should cleanup on beforeExit', async () => {
    await import('../../../src/ts-runner/runner.js');

    process.emit('beforeExit');

    await new Promise((resolve) => setImmediate(resolve));

    expect(agentInstanceMock.destroy).toHaveBeenCalled();
  });

  test('should cleanup and exit on uncaughtException', async () => {
    const { cleanup } = await import('../../../src/ts-runner/runner.js');
    const error = new Error('Test error');

    process.emit('uncaughtException', error);

    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    expect(consoleErrorMock).toHaveBeenCalledWith('Uncaught Exception:', error);
    expect(processExitMock).toHaveBeenCalledWith(1);

    await cleanup();
    expect(agentInstanceMock.destroy).toHaveBeenCalled();
  });

  test('should cleanup and exit on unhandledRejection', async () => {
    const { cleanup } = await import('../../../src/ts-runner/runner.js');
    const reason = new Error('Test rejection');

    process.emit('unhandledRejection', reason);

    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    expect(consoleErrorMock).toHaveBeenCalledWith(
      'Unhandled Rejection:',
      reason,
    );
    expect(processExitMock).toHaveBeenCalledWith(1);

    await cleanup();
    expect(agentInstanceMock.destroy).toHaveBeenCalled();
  });
});
