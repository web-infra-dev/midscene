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

describe('AndroidMidsceneTools', () => {
  beforeEach(() => {
    vi.mocked(agentFromAdbDevice).mockResolvedValue(createMockAgent() as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('passes top-level deviceId to take_screenshot', async () => {
    const tools = new AndroidMidsceneTools();
    await tools.initTools();

    const takeScreenshotTool = tools
      .getToolDefinitions()
      .find((tool) => tool.name === 'take_screenshot');

    expect(takeScreenshotTool).toBeDefined();

    await takeScreenshotTool?.handler({ deviceId: 'target-device' });

    expect(agentFromAdbDevice).toHaveBeenCalledWith('target-device', {
      autoDismissKeyboard: false,
    });
  });

  it('passes nested android.deviceId to take_screenshot', async () => {
    const tools = new AndroidMidsceneTools();
    await tools.initTools();

    const takeScreenshotTool = tools
      .getToolDefinitions()
      .find((tool) => tool.name === 'take_screenshot');

    expect(takeScreenshotTool).toBeDefined();

    await takeScreenshotTool?.handler({
      android: { deviceId: 'nested-target-device' },
    });

    expect(agentFromAdbDevice).toHaveBeenCalledWith('nested-target-device', {
      autoDismissKeyboard: false,
    });
  });

  it('passes nested android.device-id to take_screenshot', async () => {
    const tools = new AndroidMidsceneTools();
    await tools.initTools();

    const takeScreenshotTool = tools
      .getToolDefinitions()
      .find((tool) => tool.name === 'take_screenshot');

    expect(takeScreenshotTool).toBeDefined();

    await takeScreenshotTool?.handler({
      android: { 'device-id': 'nested-kebab-target-device' },
    });

    expect(agentFromAdbDevice).toHaveBeenCalledWith(
      'nested-kebab-target-device',
      {
        autoDismissKeyboard: false,
      },
    );
  });

  it('passes nested android.deviceId to act', async () => {
    const mockAgent = createMockAgent();
    vi.mocked(agentFromAdbDevice).mockResolvedValue(mockAgent as any);

    const tools = new AndroidMidsceneTools();
    await tools.initTools();

    const actTool = tools
      .getToolDefinitions()
      .find((tool) => tool.name === 'act');

    expect(actTool).toBeDefined();

    await actTool?.handler({
      prompt: 'open settings',
      android: { deviceId: 'act-target-device' },
    });

    expect(agentFromAdbDevice).toHaveBeenCalledWith('act-target-device', {
      autoDismissKeyboard: false,
    });
    expect(mockAgent.aiAction).toHaveBeenCalledWith('open settings', {
      deepThink: false,
    });
  });

  it('passes common agent behavior args to agent creation', async () => {
    const tools = new AndroidMidsceneTools();
    await tools.initTools();

    const takeScreenshotTool = tools
      .getToolDefinitions()
      .find((tool) => tool.name === 'take_screenshot');

    expect(takeScreenshotTool).toBeDefined();

    await takeScreenshotTool?.handler({
      android: {
        deviceId: 'target-device',
        waitAfterAction: 650,
        replanningCycleLimit: 12,
        aiActContext: 'accept permission dialogs',
        screenshotShrinkFactor: 2,
      },
    });

    expect(agentFromAdbDevice).toHaveBeenCalledWith('target-device', {
      autoDismissKeyboard: false,
      waitAfterAction: 650,
      replanningCycleLimit: 12,
      aiActContext: 'accept permission dialogs',
      screenshotShrinkFactor: 2,
    });
  });

  it('exposes android init args on action and common tool schemas', async () => {
    const tools = new AndroidMidsceneTools();
    await tools.initTools();

    const takeScreenshotTool = tools
      .getToolDefinitions()
      .find((tool) => tool.name === 'take_screenshot');
    const actTool = tools
      .getToolDefinitions()
      .find((tool) => tool.name === 'act');

    expect(takeScreenshotTool?.schema).toHaveProperty('android.deviceId');
    expect(actTool?.schema).toHaveProperty('android.deviceId');
  });

  it('prefers namespaced deviceId over top-level bare deviceId', async () => {
    const tools = new AndroidMidsceneTools();
    await tools.initTools();

    const takeScreenshotTool = tools
      .getToolDefinitions()
      .find((tool) => tool.name === 'take_screenshot');

    // When both forms are present, the namespaced form wins so multi-platform
    // callers cannot be cross-contaminated by a stray top-level deviceId.
    await takeScreenshotTool?.handler({
      deviceId: 'bare-loser',
      android: { deviceId: 'namespaced-winner' },
    });

    expect(agentFromAdbDevice).toHaveBeenCalledWith('namespaced-winner', {
      autoDismissKeyboard: false,
    });
  });

  it('reuses the Android agent when called twice with identical init args', async () => {
    const mockAgent = createMockAgent();
    vi.mocked(agentFromAdbDevice).mockResolvedValue(mockAgent as any);

    const tools = new AndroidMidsceneTools();
    await tools.initTools();

    const takeScreenshotTool = tools
      .getToolDefinitions()
      .find((tool) => tool.name === 'take_screenshot');

    await takeScreenshotTool?.handler({
      android: { deviceId: 'device-A', waitAfterAction: 650 },
    });
    await takeScreenshotTool?.handler({
      android: { deviceId: 'device-A', waitAfterAction: 650 },
    });

    expect(agentFromAdbDevice).toHaveBeenCalledTimes(1);
    expect(mockAgent.destroy).not.toHaveBeenCalled();
  });

  it('rebuilds the Android agent when init args change', async () => {
    const firstAgent = createMockAgent();
    const secondAgent = createMockAgent();
    vi.mocked(agentFromAdbDevice)
      .mockResolvedValueOnce(firstAgent as any)
      .mockResolvedValueOnce(secondAgent as any);

    const tools = new AndroidMidsceneTools();
    await tools.initTools();

    const takeScreenshotTool = tools
      .getToolDefinitions()
      .find((tool) => tool.name === 'take_screenshot');

    await takeScreenshotTool?.handler({
      android: { deviceId: 'device-A', waitAfterAction: 650 },
    });
    await takeScreenshotTool?.handler({
      android: { deviceId: 'device-A', waitAfterAction: 900 },
    });

    expect(agentFromAdbDevice).toHaveBeenCalledTimes(2);
    expect(firstAgent.destroy).toHaveBeenCalledTimes(1);
    expect(agentFromAdbDevice).toHaveBeenLastCalledWith('device-A', {
      autoDismissKeyboard: false,
      waitAfterAction: 900,
    });
  });

  it('rebuilds the Android agent when init args are omitted after being set', async () => {
    const firstAgent = createMockAgent();
    const secondAgent = createMockAgent();
    vi.mocked(agentFromAdbDevice)
      .mockResolvedValueOnce(firstAgent as any)
      .mockResolvedValueOnce(secondAgent as any);

    const tools = new AndroidMidsceneTools();
    await tools.initTools();

    const takeScreenshotTool = tools
      .getToolDefinitions()
      .find((tool) => tool.name === 'take_screenshot');

    await takeScreenshotTool?.handler({
      android: { deviceId: 'device-A', waitAfterAction: 650 },
    });
    await takeScreenshotTool?.handler({});

    expect(agentFromAdbDevice).toHaveBeenCalledTimes(2);
    expect(firstAgent.destroy).toHaveBeenCalledTimes(1);
    expect(agentFromAdbDevice).toHaveBeenLastCalledWith(undefined, {
      autoDismissKeyboard: false,
    });
  });
});
