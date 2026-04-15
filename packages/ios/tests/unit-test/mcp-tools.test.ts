import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { agentFromWebDriverAgent } from '../../src/agent';
import { IOSMidsceneTools } from '../../src/mcp-tools';

vi.mock('../../src/agent', () => ({
  agentFromWebDriverAgent: vi.fn(),
}));

vi.mock('../../src/device', () => ({
  IOSDevice: vi.fn().mockImplementation(() => ({
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

describe('IOSMidsceneTools', () => {
  beforeEach(() => {
    vi.mocked(agentFromWebDriverAgent).mockResolvedValue(
      createMockAgent() as any,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('passes namespaced ios init args to take_screenshot', async () => {
    const tools = new IOSMidsceneTools();
    await tools.initTools();

    const takeScreenshotTool = tools
      .getToolDefinitions()
      .find((tool) => tool.name === 'take_screenshot');

    expect(takeScreenshotTool).toBeDefined();

    await takeScreenshotTool?.handler({
      ios: { deviceId: 'ios-target', 'wda-port': 8100 },
    });

    expect(agentFromWebDriverAgent).toHaveBeenCalledWith({
      autoDismissKeyboard: false,
      deviceId: 'ios-target',
      wdaPort: 8100,
    });
  });

  it('passes top-level ios aliases to act', async () => {
    const mockAgent = createMockAgent();
    vi.mocked(agentFromWebDriverAgent).mockResolvedValue(mockAgent as any);

    const tools = new IOSMidsceneTools();
    await tools.initTools();

    const actTool = tools
      .getToolDefinitions()
      .find((tool) => tool.name === 'act');

    expect(actTool).toBeDefined();

    await actTool?.handler({
      prompt: 'open settings',
      'wda-host': '127.0.0.1',
      'wda-port': 8101,
    });

    expect(agentFromWebDriverAgent).toHaveBeenCalledWith({
      autoDismissKeyboard: false,
      wdaHost: '127.0.0.1',
      wdaPort: 8101,
    });
    expect(mockAgent.aiAction).toHaveBeenCalledWith('open settings', {
      deepThink: false,
    });
  });

  it('exposes ios init args on action and common tool schemas', async () => {
    const tools = new IOSMidsceneTools();
    await tools.initTools();

    const takeScreenshotTool = tools
      .getToolDefinitions()
      .find((tool) => tool.name === 'take_screenshot');
    const actTool = tools
      .getToolDefinitions()
      .find((tool) => tool.name === 'act');

    expect(takeScreenshotTool?.schema).toEqual(
      expect.objectContaining({
        'ios.deviceId': expect.anything(),
        'ios.wdaPort': expect.anything(),
      }),
    );
    expect(actTool?.schema).toEqual(
      expect.objectContaining({
        'ios.deviceId': expect.anything(),
        'ios.wdaPort': expect.anything(),
      }),
    );
  });
});
