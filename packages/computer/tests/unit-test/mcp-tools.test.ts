import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { agentFromComputer } from '../../src/agent';
import { ComputerMidsceneTools } from '../../src/mcp-tools';

vi.mock('../../src/agent', () => ({
  agentFromComputer: vi.fn(),
}));

vi.mock('../../src/device', () => ({
  ComputerDevice: vi.fn().mockImplementation(() => ({
    actionSpace: vi.fn().mockReturnValue([]),
    destroy: vi.fn(),
  })),
}));

const validPngBase64 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function createMockAgent() {
  return {
    interface: {
      screenshotBase64: vi.fn().mockResolvedValue(validPngBase64),
    },
    page: {
      screenshotBase64: vi.fn().mockResolvedValue(validPngBase64),
    },
    aiAction: vi.fn().mockResolvedValue('done'),
    destroy: vi.fn(),
  };
}

describe('ComputerMidsceneTools', () => {
  beforeEach(() => {
    vi.mocked(agentFromComputer).mockResolvedValue(createMockAgent() as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('passes namespaced computer init args to take_screenshot', async () => {
    const tools = new ComputerMidsceneTools();
    await tools.initTools();

    const takeScreenshotTool = tools
      .getToolDefinitions()
      .find((tool) => tool.name === 'take_screenshot');

    expect(takeScreenshotTool).toBeDefined();

    await takeScreenshotTool?.handler({
      computer: { 'display-id': 'display-2', headless: true },
    });

    expect(agentFromComputer).toHaveBeenCalledWith({
      displayId: 'display-2',
      headless: true,
    });
  });

  it('passes top-level display-id alias to act', async () => {
    const mockAgent = createMockAgent();
    vi.mocked(agentFromComputer).mockResolvedValue(mockAgent as any);

    const tools = new ComputerMidsceneTools();
    await tools.initTools();

    const actTool = tools
      .getToolDefinitions()
      .find((tool) => tool.name === 'act');

    expect(actTool).toBeDefined();

    await actTool?.handler({
      prompt: 'open browser',
      'display-id': 'display-3',
    });

    expect(agentFromComputer).toHaveBeenCalledWith({
      displayId: 'display-3',
    });
    expect(mockAgent.aiAction).toHaveBeenCalledWith('open browser', {
      deepThink: false,
    });
  });

  it('exposes computer init args on action and common tool schemas', async () => {
    const tools = new ComputerMidsceneTools();
    await tools.initTools();

    const takeScreenshotTool = tools
      .getToolDefinitions()
      .find((tool) => tool.name === 'take_screenshot');
    const actTool = tools
      .getToolDefinitions()
      .find((tool) => tool.name === 'act');

    expect(takeScreenshotTool?.schema).toEqual(
      expect.objectContaining({
        'computer.displayId': expect.anything(),
        'computer.headless': expect.anything(),
      }),
    );
    expect(actTool?.schema).toEqual(
      expect.objectContaining({
        'computer.displayId': expect.anything(),
        'computer.headless': expect.anything(),
      }),
    );
  });
});
