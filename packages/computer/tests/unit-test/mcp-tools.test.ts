import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { getMidsceneRunBaseDir } from '@midscene/shared/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { agentForRDPComputer, agentFromComputer } from '../../src/agent';
import { ComputerMidsceneTools } from '../../src/mcp-tools';

vi.mock('../../src/agent', () => ({
  agentFromComputer: vi.fn(),
  agentForRDPComputer: vi.fn(),
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

function clearCliReportSession(): void {
  const sessionDir = join(getMidsceneRunBaseDir(), 'cli-report-session');
  if (existsSync(sessionDir)) {
    rmSync(sessionDir, { recursive: true, force: true });
  }
}

describe('ComputerMidsceneTools', () => {
  beforeEach(() => {
    clearCliReportSession();
    vi.mocked(agentFromComputer).mockResolvedValue(createMockAgent() as any);
    vi.mocked(agentForRDPComputer).mockResolvedValue(createMockAgent() as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
    clearCliReportSession();
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
        'computer.host': expect.anything(),
        'computer.port': expect.anything(),
        'computer.username': expect.anything(),
        'computer.password': expect.anything(),
        'computer.securityProtocol': expect.anything(),
      }),
    );
  });

  it('routes connect with host to agentForRDPComputer', async () => {
    const tools = new ComputerMidsceneTools();
    await tools.initTools();

    const connectTool = tools
      .getToolDefinitions()
      .find((tool) => tool.name === 'computer_connect');

    expect(connectTool).toBeDefined();

    await connectTool?.handler({
      host: 'remote.example.com',
      port: 3390,
      username: 'admin',
      password: 'secret',
      'security-protocol': 'nla',
      'ignore-certificate': true,
    });

    expect(agentForRDPComputer).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'remote.example.com',
        port: 3390,
        username: 'admin',
        password: 'secret',
        securityProtocol: 'nla',
        ignoreCertificate: true,
      }),
    );
    expect(agentFromComputer).not.toHaveBeenCalled();
  });

  it('normalizes bracketed IPv6 host for RDP connect args and text', async () => {
    const tools = new ComputerMidsceneTools();
    await tools.initTools();

    const connectTool = tools
      .getToolDefinitions()
      .find((tool) => tool.name === 'computer_connect');

    expect(connectTool).toBeDefined();

    const result = await connectTool?.handler({
      host: '[2001:db8::7]',
      port: 3390,
      username: 'admin',
    });

    expect(agentForRDPComputer).toHaveBeenCalledWith(
      expect.objectContaining({
        host: '2001:db8::7',
        port: 3390,
        username: 'admin',
      }),
    );
    expect((result as any).content[0].text).toBe(
      'Connected to computer via RDP ([2001:db8::7]:3390 as admin)',
    );
  });

  it('routes action tools with namespaced host to agentForRDPComputer', async () => {
    const tools = new ComputerMidsceneTools();
    await tools.initTools();

    const takeScreenshotTool = tools
      .getToolDefinitions()
      .find((tool) => tool.name === 'take_screenshot');

    expect(takeScreenshotTool).toBeDefined();

    await takeScreenshotTool?.handler({
      computer: {
        host: 'remote.example.com',
        port: 3389,
        username: 'admin',
      },
    });

    expect(agentForRDPComputer).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'remote.example.com',
        port: 3389,
        username: 'admin',
      }),
    );
    expect(agentFromComputer).not.toHaveBeenCalled();
  });

  it('keeps local connect path when host is omitted', async () => {
    const tools = new ComputerMidsceneTools();
    await tools.initTools();

    const connectTool = tools
      .getToolDefinitions()
      .find((tool) => tool.name === 'computer_connect');

    expect(connectTool).toBeDefined();

    await connectTool?.handler({
      'display-id': 'display-2',
    });

    expect(agentFromComputer).toHaveBeenCalledWith(
      expect.objectContaining({
        displayId: 'display-2',
      }),
    );
    expect(agentForRDPComputer).not.toHaveBeenCalled();
  });
});
