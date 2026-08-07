import { afterEach, beforeEach, describe, expect, it, rs } from '@rstest/core';
import { agentFromHdcDevice } from '../../src/agent';
import { HarmonyMidsceneTools } from '../../src/agent-tools';

rs.mock('../../src/agent', () => ({
  agentFromHdcDevice: rs.fn(),
}));

rs.mock('../../src/device', () => ({
  HarmonyDevice: rs.fn().mockImplementation(() => ({
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

describe('HarmonyMidsceneTools', () => {
  beforeEach(() => {
    rs.mocked(agentFromHdcDevice).mockResolvedValue(createMockAgent() as any);
  });

  afterEach(() => {
    rs.clearAllMocks();
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
    rs.mocked(agentFromHdcDevice).mockResolvedValue(mockAgent as any);

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

  it('passes common agent behavior args to agent creation', async () => {
    const tools = new HarmonyMidsceneTools();
    await tools.initTools();

    const takeScreenshotTool = tools
      .getToolDefinitions()
      .find((tool) => tool.name === 'take_screenshot');

    expect(takeScreenshotTool).toBeDefined();

    await takeScreenshotTool?.handler({
      harmony: {
        deviceId: 'target-harmony-device',
        waitAfterAction: 650,
        replanningCycleLimit: 12,
        aiActContext: 'accept permission dialogs',
        screenshotShrinkFactor: 2,
      },
    });

    expect(agentFromHdcDevice).toHaveBeenCalledWith('target-harmony-device', {
      autoDismissKeyboard: false,
      waitAfterAction: 650,
      replanningCycleLimit: 12,
      aiActContext: 'accept permission dialogs',
      screenshotShrinkFactor: 2,
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
    expect(takeScreenshotTool?.schema).toHaveProperty(
      'harmony.waitAfterAction',
    );
    expect(takeScreenshotTool?.schema).toHaveProperty(
      'harmony.replanningCycleLimit',
    );
    expect(takeScreenshotTool?.schema).toHaveProperty(
      'harmony.screenshotShrinkFactor',
    );
    expect(actTool?.schema).toHaveProperty('harmony.deviceId');
    expect(actTool?.schema).toHaveProperty('harmony.waitAfterAction');
  });

  it('reuses the Harmony agent when called twice with identical init args', async () => {
    const mockAgent = createMockAgent();
    rs.mocked(agentFromHdcDevice).mockResolvedValue(mockAgent as any);

    const tools = new HarmonyMidsceneTools();
    await tools.initTools();

    const takeScreenshotTool = tools
      .getToolDefinitions()
      .find((tool) => tool.name === 'take_screenshot');

    await takeScreenshotTool?.handler({
      harmony: { deviceId: 'device-A', waitAfterAction: 650 },
    });
    await takeScreenshotTool?.handler({
      harmony: { deviceId: 'device-A', waitAfterAction: 650 },
    });

    expect(agentFromHdcDevice).toHaveBeenCalledTimes(1);
    expect(mockAgent.destroy).not.toHaveBeenCalled();
  });

  it('rebuilds the Harmony agent when init args change', async () => {
    const firstAgent = createMockAgent();
    const secondAgent = createMockAgent();
    rs.mocked(agentFromHdcDevice)
      .mockResolvedValueOnce(firstAgent as any)
      .mockResolvedValueOnce(secondAgent as any);

    const tools = new HarmonyMidsceneTools();
    await tools.initTools();

    const takeScreenshotTool = tools
      .getToolDefinitions()
      .find((tool) => tool.name === 'take_screenshot');

    await takeScreenshotTool?.handler({
      harmony: { deviceId: 'device-A', waitAfterAction: 650 },
    });
    await takeScreenshotTool?.handler({
      harmony: { deviceId: 'device-B', waitAfterAction: 650 },
    });

    expect(agentFromHdcDevice).toHaveBeenCalledTimes(2);
    expect(firstAgent.destroy).toHaveBeenCalledTimes(1);
    expect(agentFromHdcDevice).toHaveBeenLastCalledWith('device-B', {
      autoDismissKeyboard: false,
      waitAfterAction: 650,
    });
  });

  it('rebuilds the Harmony agent when init args are omitted after being set', async () => {
    const firstAgent = createMockAgent();
    const secondAgent = createMockAgent();
    rs.mocked(agentFromHdcDevice)
      .mockResolvedValueOnce(firstAgent as any)
      .mockResolvedValueOnce(secondAgent as any);

    const tools = new HarmonyMidsceneTools();
    await tools.initTools();

    const takeScreenshotTool = tools
      .getToolDefinitions()
      .find((tool) => tool.name === 'take_screenshot');

    await takeScreenshotTool?.handler({
      harmony: { deviceId: 'device-A', waitAfterAction: 650 },
    });
    await takeScreenshotTool?.handler({});

    expect(agentFromHdcDevice).toHaveBeenCalledTimes(2);
    expect(firstAgent.destroy).toHaveBeenCalledTimes(1);
    expect(agentFromHdcDevice).toHaveBeenLastCalledWith(undefined, {
      autoDismissKeyboard: false,
    });
  });
});
