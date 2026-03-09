import { mcpKitForAgent, mcpServerForAgent, runSkillCLI } from '@/mcp/index';
import { describe, expect, it, vi } from 'vitest';

describe('mcpKitForAgent', () => {
  it('should return description and tools for a given agent', async () => {
    const mockAgent = {
      interface: {},
      page: {
        screenshotBase64: vi
          .fn()
          .mockResolvedValue('data:image/png;base64,abc'),
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
    };

    const result = await mcpKitForAgent(mockAgent as any);

    expect(result).toBeDefined();
    expect(typeof result.description).toBe('string');
    expect(Array.isArray(result.tools)).toBe(true);
    expect(result.tools.length).toBeGreaterThan(0);

    for (const tool of result.tools) {
      expect(tool).toHaveProperty('name');
      expect(tool).toHaveProperty('description');
      expect(tool).toHaveProperty('schema');
      expect(tool).toHaveProperty('handler');
      expect(typeof tool.name).toBe('string');
      expect(typeof tool.handler).toBe('function');
    }

    expect(mockAgent.getActionSpace).toHaveBeenCalled();
  });

  it('should generate tools from action space', async () => {
    const mockAgent = {
      interface: {},
      page: {
        screenshotBase64: vi
          .fn()
          .mockResolvedValue('data:image/png;base64,abc'),
      },
      getActionSpace: vi.fn().mockResolvedValue([
        { name: 'tap', description: 'Tap element' },
        { name: 'input', description: 'Input text' },
      ]),
    };

    const result = await mcpKitForAgent(mockAgent as any);

    const tapTool = result.tools.find((t) => t.name === 'tap');
    const inputTool = result.tools.find((t) => t.name === 'input');
    expect(tapTool).toBeDefined();
    expect(inputTool).toBeDefined();
  });

  it('should include common tools like take_screenshot', async () => {
    const mockAgent = {
      interface: {},
      page: {
        screenshotBase64: vi
          .fn()
          .mockResolvedValue('data:image/png;base64,abc'),
      },
      getActionSpace: vi.fn().mockResolvedValue([]),
    };

    const result = await mcpKitForAgent(mockAgent as any);

    const screenshotTool = result.tools.find(
      (t) => t.name === 'take_screenshot',
    );
    expect(screenshotTool).toBeDefined();
    expect(screenshotTool?.description).toContain('screenshot');
  });

  it('should NOT include platform-specific tools (connect/disconnect)', async () => {
    const mockAgent = {
      interface: {},
      page: {
        screenshotBase64: vi
          .fn()
          .mockResolvedValue('data:image/png;base64,abc'),
      },
      getActionSpace: vi.fn().mockResolvedValue([]),
    };

    const result = await mcpKitForAgent(mockAgent as any);

    const connectTool = result.tools.find((t) => t.name.includes('connect'));
    expect(connectTool).toBeUndefined();
  });
});

describe('mcpServerForAgent', () => {
  it('should return an object with launch and launchHttp methods', () => {
    const mockAgent = {
      interface: { constructor: { name: 'MockDevice' } },
      constructor: { name: 'MockAgent' },
    };

    const launcher = mcpServerForAgent(mockAgent as any);

    expect(launcher).toBeDefined();
    expect(typeof launcher.launch).toBe('function');
    expect(typeof launcher.launchHttp).toBe('function');
  });
});

describe('runSkillCLI', () => {
  it('should be a function', () => {
    expect(typeof runSkillCLI).toBe('function');
  });

  it('should show help and exit when called with --help', async () => {
    const mockDevice = class {
      interfaceType = 'mock';
      async screenshotBase64() {
        return 'data:image/png;base64,abc';
      }
      async size() {
        return { width: 1920, height: 1080 };
      }
      actionSpace() {
        return [];
      }
    };

    // runSkillCLI reads process.argv, override it
    const originalArgv = process.argv;
    process.argv = ['node', 'test', '--help'];

    // Should print help and return without error
    await runSkillCLI({
      DeviceClass: mockDevice as any,
      scriptName: 'test-device',
    });

    process.argv = originalArgv;
  });
});
