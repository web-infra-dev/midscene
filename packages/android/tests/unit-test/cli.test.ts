/**
 * Integration test for the Android MCP CLI path.
 *
 * Exercises the full `runToolsCLI(argv) → parseCliArgs → handler dispatch →
 * ensureAgent → agentFromAdbDevice` chain with a real AndroidMidsceneTools
 * instance (only the adb agent factory is mocked). This complements the
 * handler-level unit tests by locking down the CLI argument plumbing.
 */
import { runToolsCLI } from '@midscene/shared/cli';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { agentFromAdbDevice } from '../../src/agent';
import { AndroidMidsceneTools } from '../../src/mcp-tools';

vi.mock('../../src/agent', () => ({
  agentFromAdbDevice: vi.fn(),
}));

vi.mock('../../src/device', () => ({
  AndroidDevice: vi.fn().mockImplementation(() => ({
    actionSpace: vi.fn().mockReturnValue([]),
    destroy: vi.fn(),
  })),
}));

const validPngBase64 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function createMockAgent() {
  return {
    page: {
      screenshotBase64: vi.fn().mockResolvedValue(validPngBase64),
    },
    aiAction: vi.fn().mockResolvedValue('done'),
    destroy: vi.fn(),
  };
}

describe('Android CLI integration', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.mocked(agentFromAdbDevice).mockResolvedValue(createMockAgent() as any);
    // Silence expected CLI log output without touching the module-level mocks
    // set up via `vi.mock` — `restoreAllMocks` would reset those too.
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    vi.mocked(agentFromAdbDevice).mockReset();
  });

  it('routes --device-id (preferred bare form) through the same pipeline', async () => {
    const tools = new AndroidMidsceneTools();

    await runToolsCLI(tools, 'midscene-android', {
      stripPrefix: 'android_',
      argv: ['take_screenshot', '--device-id', 'bare-kebab-device'],
    });

    expect(agentFromAdbDevice).toHaveBeenCalledWith('bare-kebab-device', {
      autoDismissKeyboard: false,
    });
  });

  it('routes --deviceId (preferred bare camel form) through the same pipeline', async () => {
    const tools = new AndroidMidsceneTools();

    await runToolsCLI(tools, 'midscene-android', {
      stripPrefix: 'android_',
      argv: ['take_screenshot', '--deviceId', 'bare-camel-device'],
    });

    expect(agentFromAdbDevice).toHaveBeenCalledWith('bare-camel-device', {
      autoDismissKeyboard: false,
    });
  });

  it('rejects --android.device-id in the single-platform CLI', async () => {
    const tools = new AndroidMidsceneTools();

    await expect(
      runToolsCLI(tools, 'midscene-android', {
        stripPrefix: 'android_',
        argv: ['take_screenshot', '--android.device-id', 'kebab-device'],
      }),
    ).rejects.toThrow(
      'Unsupported option "--android.device-id" for midscene-android take_screenshot.',
    );

    expect(agentFromAdbDevice).not.toHaveBeenCalled();
  });

  it('rejects --android.deviceId in the single-platform CLI', async () => {
    const tools = new AndroidMidsceneTools();

    await expect(
      runToolsCLI(tools, 'midscene-android', {
        stripPrefix: 'android_',
        argv: ['take_screenshot', '--android.deviceId', 'camel-device'],
      }),
    ).rejects.toThrow(
      'Unsupported option "--android.deviceId" for midscene-android take_screenshot.',
    );

    expect(agentFromAdbDevice).not.toHaveBeenCalled();
  });

  it('threads init args through the act command alongside --prompt', async () => {
    const mockAgent = createMockAgent();
    vi.mocked(agentFromAdbDevice).mockResolvedValue(mockAgent as any);

    const tools = new AndroidMidsceneTools();

    await runToolsCLI(tools, 'midscene-android', {
      stripPrefix: 'android_',
      argv: ['act', '--prompt', 'open settings', '--device-id', 'act-device'],
    });

    expect(agentFromAdbDevice).toHaveBeenCalledWith('act-device', {
      autoDismissKeyboard: false,
    });
    expect(mockAgent.aiAction).toHaveBeenCalledWith('open settings', {
      deepThink: false,
    });
  });

  it('strips init args from the payload passed to the action', async () => {
    const mockAgent = createMockAgent();
    vi.mocked(agentFromAdbDevice).mockResolvedValue(mockAgent as any);

    const tools = new AndroidMidsceneTools();

    await runToolsCLI(tools, 'midscene-android', {
      stripPrefix: 'android_',
      argv: ['act', '--prompt', 'do X', '--device-id', 'sanitize-target'],
    });

    // The aiAction call must not carry the init args — they are agent-level,
    // not action-level. `sanitizeToolArgs` is what strips them.
    const [, actionOpts] = mockAgent.aiAction.mock.calls[0];
    expect(actionOpts).toEqual({ deepThink: false });
  });

  it('renders bare flags first in single-platform command help', async () => {
    const tools = new AndroidMidsceneTools();
    const output: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      output.push(args.map(String).join(' '));
    });

    await runToolsCLI(tools, 'midscene-android', {
      stripPrefix: 'android_',
      argv: ['connect', '--help'],
    });

    expect(output.join('\n')).toContain('--device-id');
    expect(output.join('\n')).toContain('--deviceId');
    expect(output.join('\n')).not.toContain('--android.device-id');
    expect(output.join('\n')).not.toContain('--android.deviceId');

    logSpy.mockRestore();
  });
});
