import { afterEach, beforeEach, describe, expect, it, rs } from '@rstest/core';
import { agentFromAdbDevice } from '../../src/agent';
import { AndroidMidsceneTools } from '../../src/agent-tools';

rs.mock('../../src/agent', () => ({
  agentFromAdbDevice: rs.fn(),
}));

rs.mock('../../src/device', () => ({
  AndroidDevice: rs.fn().mockImplementation(() => ({
    actionSpace: rs.fn().mockReturnValue([]),
    destroy: rs.fn(),
  })),
}));

const validPngBase64 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function createMockAgent() {
  return {
    page: {
      screenshotBase64: rs.fn().mockResolvedValue(validPngBase64),
    },
    aiAction: rs.fn().mockResolvedValue('done'),
    destroy: rs.fn(),
  };
}

describe('AndroidMidsceneTools', () => {
  beforeEach(() => {
    rs.mocked(agentFromAdbDevice).mockResolvedValue(createMockAgent() as any);
  });

  afterEach(() => {
    rs.clearAllMocks();
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
    rs.mocked(agentFromAdbDevice).mockResolvedValue(mockAgent as any);

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
    expect(takeScreenshotTool?.schema).toHaveProperty('android.aiActContext');
    expect(takeScreenshotTool?.schema).not.toHaveProperty(
      'android.aiActionContext',
    );
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
    rs.mocked(agentFromAdbDevice).mockResolvedValue(mockAgent as any);

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
    rs.mocked(agentFromAdbDevice)
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
    rs.mocked(agentFromAdbDevice)
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
