import { BaseMidsceneTools } from '@/mcp/base-tools';
import type { BaseAgent, BaseDevice, ToolDefinition } from '@/mcp/types';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

class DummyTools extends BaseMidsceneTools<BaseAgent> {
  sessionIdSeen?: string;

  private readonly mockAgent: BaseAgent = {
    getActionSpace: async () => [],
    page: {
      screenshotBase64: async () => 'data:image/png;base64,AAAA',
    },
    aiAction: async () => undefined,
  };

  protected async ensureAgent(): Promise<BaseAgent> {
    this.sessionIdSeen = this.getInvocationStringArg('sessionId');
    return this.mockAgent;
  }

  protected createTemporaryDevice(): BaseDevice {
    return {
      actionSpace: () => [
        {
          name: 'Tap',
          description: 'Tap action',
          paramSchema: z.object({}),
        },
      ],
    };
  }

  protected preparePlatformTools(): ToolDefinition[] {
    return [
      {
        name: 'dummy_connect',
        description: 'Connect dummy tool',
        schema: {},
        handler: async (args: Record<string, unknown>) =>
          this.runWithInvocationContext(args, async () => {
            await this.ensureAgent();
            return this.buildTextResult('connected');
          }),
      },
    ];
  }
}

describe('BaseMidsceneTools session invocation context', () => {
  it('injects sessionId schema and forwards invocation context to generated tools', async () => {
    const tools = new DummyTools();
    await tools.initTools();

    const tapTool = tools
      .getToolDefinitions()
      .find((tool) => tool.name === 'Tap');
    expect(tapTool).toBeTruthy();
    expect(tapTool?.schema.sessionId).toBeTruthy();

    await tapTool!.handler({ sessionId: 'session-1' });

    expect(tools.sessionIdSeen).toBe('session-1');
  });

  it('forwards invocation context to platform-specific tools', async () => {
    const tools = new DummyTools();
    await tools.initTools();

    const connectTool = tools
      .getToolDefinitions()
      .find((tool) => tool.name === 'dummy_connect');
    expect(connectTool).toBeTruthy();
    expect(connectTool?.schema.sessionId).toBeTruthy();

    await connectTool!.handler({ sessionId: 'session-2' });

    expect(tools.sessionIdSeen).toBe('session-2');
  });
});
