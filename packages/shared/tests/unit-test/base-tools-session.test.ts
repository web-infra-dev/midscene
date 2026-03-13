import { BaseMidsceneTools } from '@/mcp/base-tools';
import type { BaseAgent, BaseDevice, ToolDefinition } from '@/mcp/types';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

class DummyTools extends BaseMidsceneTools<BaseAgent> {
  sessionIdsSeen: string[] = [];
  createdAgentCount = 0;

  protected async ensureAgent(
    _initParam?: string,
    options?: { sessionId?: string },
  ): Promise<BaseAgent> {
    const sessionId = options?.sessionId;

    if (this.agent && !this.shouldResetAgentForSession(sessionId)) {
      this.sessionIdsSeen.push(`reuse:${sessionId ?? 'no-session'}`);
      return this.agent;
    }

    this.sessionIdsSeen.push(sessionId ?? 'no-session');
    this.createdAgentCount += 1;
    await new Promise((resolve) =>
      setTimeout(resolve, sessionId === 'session-1' ? 20 : 0),
    );

    this.agent = {
      getActionSpace: async () => [],
      opts: sessionId ? { sessionId } : undefined,
      page: {
        screenshotBase64: async () => 'data:image/png;base64,AAAA',
      },
      aiAction: async () => undefined,
    };

    return this.agent;
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
        handler: async (args: Record<string, unknown>) => {
          await this.ensureAgent(undefined, this.getAgentOptions(args));
          return this.buildTextResult('connected');
        },
      },
    ];
  }
}

describe('BaseMidsceneTools session arguments', () => {
  it('injects sessionId schema and forwards sessionId to generated tools', async () => {
    const tools = new DummyTools();
    await tools.initTools();

    const tapTool = tools
      .getToolDefinitions()
      .find((tool) => tool.name === 'Tap');
    expect(tapTool).toBeTruthy();
    expect(tapTool?.schema.sessionId).toBeTruthy();

    await tapTool!.handler({ sessionId: 'session-1' });

    expect(tools.sessionIdsSeen).toContain('session-1');
  });

  it('forwards sessionId to platform-specific tools', async () => {
    const tools = new DummyTools();
    await tools.initTools();

    const connectTool = tools
      .getToolDefinitions()
      .find((tool) => tool.name === 'dummy_connect');
    expect(connectTool).toBeTruthy();
    expect(connectTool?.schema.sessionId).toBeTruthy();

    await connectTool!.handler({ sessionId: 'session-2' });

    expect(tools.sessionIdsSeen).toContain('session-2');
  });

  it('keeps concurrent tool calls isolated by explicit session args', async () => {
    const tools = new DummyTools();
    await tools.initTools();

    const tapTool = tools
      .getToolDefinitions()
      .find((tool) => tool.name === 'Tap');
    expect(tapTool).toBeTruthy();

    await Promise.all([
      tapTool!.handler({ sessionId: 'session-1' }),
      tapTool!.handler({ sessionId: 'session-2' }),
    ]);

    expect(tools.sessionIdsSeen).toEqual(
      expect.arrayContaining(['session-1', 'session-2']),
    );
  });

  it('recreates the agent when sessionId changes', async () => {
    const tools = new DummyTools();
    await tools.initTools();

    const tapTool = tools
      .getToolDefinitions()
      .find((tool) => tool.name === 'Tap');
    expect(tapTool).toBeTruthy();

    await tapTool!.handler({ sessionId: 'session-1' });
    await tapTool!.handler({ sessionId: 'session-1' });
    await tapTool!.handler({ sessionId: 'session-2' });

    expect(tools.createdAgentCount).toBe(2);
  });
});
