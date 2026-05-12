import { runToolsCLI } from '@midscene/shared/cli';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { agentFromWebDriverAgent } from '../../src/agent';
import { IOSMidsceneTools } from '../../src/mcp-tools';

// Mock the agent entry point only. IOSDevice is intentionally NOT mocked so
// that the real actionSpace (including Launch/Terminate) reaches the tool
// generator — this is what drives the CLI surface we need to verify.
vi.mock('../../src/agent', () => ({
  agentFromWebDriverAgent: vi.fn(),
}));

const validPngBase64 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function createMockAgent() {
  return {
    page: {
      screenshotBase64: vi.fn().mockResolvedValue(validPngBase64),
    },
    callActionInActionSpace: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(),
  };
}

describe('midscene-ios CLI argv path for launch/terminate (issue #2313)', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let capturedStdout: string;
  let capturedStderr: string;

  beforeEach(() => {
    capturedStdout = '';
    capturedStderr = '';
    consoleLogSpy = vi
      .spyOn(console, 'log')
      .mockImplementation((...args: unknown[]) => {
        capturedStdout += `${args.join(' ')}\n`;
      });
    consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation((...args: unknown[]) => {
        capturedStderr += `${args.join(' ')}\n`;
      });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    vi.clearAllMocks();
  });

  it('routes `launch --uri <bundle>` through to callActionInActionSpace with { uri }', async () => {
    const mockAgent = createMockAgent();
    vi.mocked(agentFromWebDriverAgent).mockResolvedValue(mockAgent as any);

    await runToolsCLI(new IOSMidsceneTools(), 'midscene-ios', {
      stripPrefix: 'ios_',
      version: '0.0.0-test',
      argv: ['launch', '--uri', 'com.apple.Preferences'],
    });

    expect(mockAgent.callActionInActionSpace).toHaveBeenCalledTimes(1);
    expect(mockAgent.callActionInActionSpace).toHaveBeenCalledWith(
      'Launch',
      expect.objectContaining({ uri: 'com.apple.Preferences' }),
    );
  });

  it('routes `terminate --uri <bundle>` through to callActionInActionSpace with { uri }', async () => {
    const mockAgent = createMockAgent();
    vi.mocked(agentFromWebDriverAgent).mockResolvedValue(mockAgent as any);

    await runToolsCLI(new IOSMidsceneTools(), 'midscene-ios', {
      stripPrefix: 'ios_',
      version: '0.0.0-test',
      argv: ['terminate', '--uri', 'com.apple.Preferences'],
    });

    expect(mockAgent.callActionInActionSpace).toHaveBeenCalledWith(
      'Terminate',
      expect.objectContaining({ uri: 'com.apple.Preferences' }),
    );
  });

  it('rejects an unknown option like `--bundleId` with a clear error', async () => {
    vi.mocked(agentFromWebDriverAgent).mockResolvedValue(
      createMockAgent() as any,
    );

    await expect(
      runToolsCLI(new IOSMidsceneTools(), 'midscene-ios', {
        stripPrefix: 'ios_',
        version: '0.0.0-test',
        argv: ['launch', '--bundleId', 'com.apple.Preferences'],
      }),
    ).rejects.toThrow(/Unknown option "--bundleId"/);
  });

  it('`launch --help` lists --uri and no ZodString prototype leak', async () => {
    vi.mocked(agentFromWebDriverAgent).mockResolvedValue(
      createMockAgent() as any,
    );

    await runToolsCLI(new IOSMidsceneTools(), 'midscene-ios', {
      stripPrefix: 'ios_',
      version: '0.0.0-test',
      argv: ['launch', '--help'],
    });

    expect(capturedStdout).toMatch(
      /--uri\s+App name, bundle ID, or URL to launch/,
    );
    // Regression: the bug shipped a help output littered with ZodString
    // prototype methods like `--parse`, `--safeParse`, `--_def`, ...
    expect(capturedStdout).not.toMatch(/--parse\b/);
    expect(capturedStdout).not.toMatch(/--safeParse\b/);
    expect(capturedStdout).not.toMatch(/--_def\b/);
    expect(capturedStdout).not.toMatch(/--parseAsync\b/);
    expect(capturedStdout).not.toMatch(/--safeParseAsync\b/);
    expect(capturedStdout).not.toMatch(/--refine\b/);
    expect(capturedStdout).not.toMatch(/--superRefine\b/);
  });

  it('`terminate --help` lists --uri and no ZodString prototype leak', async () => {
    vi.mocked(agentFromWebDriverAgent).mockResolvedValue(
      createMockAgent() as any,
    );

    await runToolsCLI(new IOSMidsceneTools(), 'midscene-ios', {
      stripPrefix: 'ios_',
      version: '0.0.0-test',
      argv: ['terminate', '--help'],
    });

    expect(capturedStdout).toMatch(/--uri\s+Bundle ID of the app to terminate/);
    expect(capturedStdout).not.toMatch(/--parse\b/);
    expect(capturedStdout).not.toMatch(/--safeParse\b/);
    expect(capturedStdout).not.toMatch(/--_def\b/);
  });
});
