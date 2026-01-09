import type { AgentOverChromeBridge } from '@/bridge-mode';
import { mcpKitForAgent } from '@/mcp-server';
import { describe, expect, it, vi } from 'vitest';

describe('mcpKitForAgent', () => {
  it('should return description and tools for a given agent', async () => {
    // Create a mock agent with minimal required methods
    const mockAgent = {
      page: {
        screenshotBase64: vi.fn().mockResolvedValue('base64data'),
      },
      getActionSpace: vi.fn().mockResolvedValue([
        {
          name: 'tap',
          description: 'Tap on an element',
          args: { locator: 'string' },
        },
        {
          name: 'input',
          description: 'Input text into an element',
          args: { locator: 'string', value: 'string' },
        },
      ]),
    } as unknown as AgentOverChromeBridge;

    // Call mcpKitForAgent
    const result = await mcpKitForAgent(mockAgent);

    // Verify the result structure
    expect(result).toBeDefined();
    expect(result.description).toBeDefined();
    expect(typeof result.description).toBe('string');
    expect(result.description).toContain('browser');

    // Verify tools array exists and has tools
    expect(Array.isArray(result.tools)).toBe(true);
    expect(result.tools.length).toBeGreaterThan(0);

    // Verify each tool has required properties
    for (const tool of result.tools) {
      expect(tool).toHaveProperty('name');
      expect(tool).toHaveProperty('description');
      expect(tool).toHaveProperty('schema');
      expect(tool).toHaveProperty('handler');
      expect(typeof tool.name).toBe('string');
      expect(typeof tool.description).toBe('string');
      expect(typeof tool.handler).toBe('function');
    }

    // Verify that getActionSpace was called
    expect(mockAgent.getActionSpace).toHaveBeenCalled();
  });

  it('should include platform-specific tools', async () => {
    const mockAgent = {
      page: {
        screenshotBase64: vi.fn().mockResolvedValue('base64data'),
      },
      getActionSpace: vi.fn().mockResolvedValue([]),
    } as unknown as AgentOverChromeBridge;

    const result = await mcpKitForAgent(mockAgent);

    // Should include web_connect tool for bridge mode
    const webConnectTool = result.tools.find(
      (tool) => tool.name === 'web_connect',
    );
    expect(webConnectTool).toBeDefined();
    expect(webConnectTool?.description).toContain('web page');
  });

  it('should include common tools like screenshot', async () => {
    const mockAgent = {
      page: {
        screenshotBase64: vi.fn().mockResolvedValue('base64data'),
      },
      getActionSpace: vi.fn().mockResolvedValue([]),
    } as unknown as AgentOverChromeBridge;

    const result = await mcpKitForAgent(mockAgent);

    // Should include take_screenshot tool
    const screenshotTool = result.tools.find(
      (tool) => tool.name === 'take_screenshot',
    );
    expect(screenshotTool).toBeDefined();
    expect(screenshotTool?.description).toContain('screenshot');
  });

  it('should generate tools from action space', async () => {
    const mockAgent = {
      page: {
        screenshotBase64: vi.fn().mockResolvedValue('base64data'),
      },
      getActionSpace: vi.fn().mockResolvedValue([
        {
          name: 'tap',
          description: 'Tap on an element',
          args: { locator: 'string' },
        },
        {
          name: 'input',
          description: 'Input text',
          args: { locator: 'string', value: 'string' },
        },
      ]),
    } as unknown as AgentOverChromeBridge;

    const result = await mcpKitForAgent(mockAgent);

    // Should include tools generated from action space
    const tapTool = result.tools.find((tool) => tool.name === 'tap');
    const inputTool = result.tools.find((tool) => tool.name === 'input');

    expect(tapTool).toBeDefined();
    expect(inputTool).toBeDefined();
  });

  it('should be compatible with MCP Server registration', async () => {
    const mockAgent = {
      page: {
        screenshotBase64: vi.fn().mockResolvedValue('base64data'),
      },
      getActionSpace: vi.fn().mockResolvedValue([
        {
          name: 'tap',
          description: 'Tap element',
        },
      ]),
    } as unknown as AgentOverChromeBridge;

    const { description, tools } = await mcpKitForAgent(mockAgent);

    // Verify the structure matches what MCP Server expects
    expect(description).toBeTruthy();

    for (const tool of tools) {
      // Each tool should have the structure needed for MCP Server registration:
      // server.tool(tool.name, tool.description, tool.schema, tool.handler)
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.schema).toBeDefined();
      expect(typeof tool.handler).toBe('function');
    }
  });

  it('should include web_disconnect tool', async () => {
    const mockAgent = {
      page: {
        screenshotBase64: vi.fn().mockResolvedValue('base64data'),
      },
      getActionSpace: vi.fn().mockResolvedValue([]),
    } as unknown as AgentOverChromeBridge;

    const result = await mcpKitForAgent(mockAgent);

    const disconnectTool = result.tools.find(
      (tool) => tool.name === 'web_disconnect',
    );
    expect(disconnectTool).toBeDefined();
    expect(disconnectTool?.description).toContain('Disconnect');
  });

  it('web_disconnect should call destroy and return success message', async () => {
    const destroyMock = vi.fn().mockResolvedValue(undefined);
    const mockAgent = {
      page: {
        screenshotBase64: vi.fn().mockResolvedValue('base64data'),
      },
      getActionSpace: vi.fn().mockResolvedValue([]),
      destroy: destroyMock,
    } as unknown as AgentOverChromeBridge;

    const result = await mcpKitForAgent(mockAgent);

    const disconnectTool = result.tools.find(
      (tool) => tool.name === 'web_disconnect',
    );
    expect(disconnectTool).toBeDefined();

    // Call the handler - since agent is set via setAgent, it should disconnect successfully
    const response = await disconnectTool?.handler({});
    expect(destroyMock).toHaveBeenCalled();
    expect(response?.content[0]).toEqual({
      type: 'text',
      text: 'Disconnected from web page',
    });
  });
});
