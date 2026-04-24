import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { agentFromHdcDevice } from '../../src/agent';
import { HarmonyMidsceneTools } from '../../src/mcp-tools';

vi.mock('../../src/agent', () => ({
  agentFromHdcDevice: vi.fn(),
}));

vi.mock('../../src/device', () => ({
  HarmonyDevice: vi.fn().mockImplementation(() => ({
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

describe('HarmonyMidsceneTools', () => {
  beforeEach(() => {
    vi.mocked(agentFromHdcDevice).mockResolvedValue(createMockAgent() as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('passes nested harmony.device-id to take_screenshot', async () => {
    const tools = new HarmonyMidsceneTools();
    await tools.initTools();

    const takeScreenshotTool = tools
      .getToolDefinitions()
      .find((tool) => tool.name === 'take_screenshot');

    expect(takeScreenshotTool).toBeDefined();

    await takeScreenshotTool?.handler({
      harmony: { 'device-id': 'target-harmony-device' },
    });

    expect(agentFromHdcDevice).toHaveBeenCalledWith('target-harmony-device', {
      autoDismissKeyboard: false,
    });
  });

  it('passes nested harmony.deviceId to act', async () => {
    const mockAgent = createMockAgent();
    vi.mocked(agentFromHdcDevice).mockResolvedValue(mockAgent as any);

    const tools = new HarmonyMidsceneTools();
    await tools.initTools();

    const actTool = tools
      .getToolDefinitions()
      .find((tool) => tool.name === 'act');

    expect(actTool).toBeDefined();

    await actTool?.handler({
      prompt: 'open settings',
      harmony: { deviceId: 'act-harmony-device' },
    });

    expect(agentFromHdcDevice).toHaveBeenCalledWith('act-harmony-device', {
      autoDismissKeyboard: false,
    });
    expect(mockAgent.aiAction).toHaveBeenCalledWith('open settings', {
      deepThink: false,
    });
  });

  it('exposes harmony init args on action and common tool schemas', async () => {
    const tools = new HarmonyMidsceneTools();
    await tools.initTools();

    const takeScreenshotTool = tools
      .getToolDefinitions()
      .find((tool) => tool.name === 'take_screenshot');
    const actTool = tools
      .getToolDefinitions()
      .find((tool) => tool.name === 'act');

    expect(takeScreenshotTool?.schema).toHaveProperty('harmony.deviceId');
    expect(actTool?.schema).toHaveProperty('harmony.deviceId');
  });
});
