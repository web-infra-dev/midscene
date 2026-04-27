import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BaseMidsceneTools } from '@/mcp/base-tools';
import type {
  ActionSpaceItem,
  BaseAgent,
  BaseDevice,
  ToolDefinition,
} from '@/mcp/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const screenshotBase64 = 'data:image/png;base64,Zm9v';

class FakeDevice implements BaseDevice {
  actionSpace(): ActionSpaceItem[] {
    return [];
  }
}

class FakeCliTools extends BaseMidsceneTools<BaseAgent> {
  constructor(private failEnsureAgent = false) {
    super();
  }

  protected getCliReportSessionName() {
    return 'midscene-test';
  }
  public readonly createdReportFileNames: Array<string | undefined> = [];
  public readonly createdReportGroupIds: Array<string | undefined> = [];
  public readonly aiAction = vi.fn().mockResolvedValue(undefined);

  protected createTemporaryDevice(): BaseDevice {
    return new FakeDevice();
  }

  protected async ensureAgent(): Promise<BaseAgent> {
    const reportOptions = this.readCliReportAgentOptions();
    this.createdReportFileNames.push(reportOptions?.reportFileName);
    this.createdReportGroupIds.push(
      reportOptions?.reportAttributes['data-group-id'],
    );
    if (this.failEnsureAgent) {
      throw new Error('connect failed');
    }
    return {
      getActionSpace: vi.fn().mockResolvedValue([]),
      aiAction: this.aiAction,
      page: {
        screenshotBase64: vi.fn().mockResolvedValue(screenshotBase64),
      },
    };
  }

  protected preparePlatformTools(): ToolDefinition[] {
    return [
      {
        name: 'test_connect',
        description: 'Connect test device',
        schema: {
          url: z.string().optional(),
        },
        handler: async () => {
          const reportSession = this.createNewCliReportSession('test-device');
          this.commitCliReportSession(reportSession);
          await this.ensureAgent();
          return {
            content: [{ type: 'text' as const, text: 'connected' }],
          };
        },
      },
    ];
  }
}

describe('CLI report session', () => {
  const originalCwd = process.cwd();
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'midscene-cli-report-session-'));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
  });

  it('records a new report file on connect and reuses it for later lazy agent commands', async () => {
    const connectTools = new FakeCliTools();
    await connectTools.initTools();
    const connectTool = connectTools
      .getToolDefinitions()
      .find((tool) => tool.name === 'test_connect');
    expect(connectTool).toBeDefined();

    await connectTool!.handler({});

    const firstReportFileName = connectTools.createdReportFileNames[0];
    expect(firstReportFileName).toMatch(/^midscene-test-test-device-/);

    const sessionPath = join(
      tempDir,
      'midscene_run',
      'cli-report-session',
      'midscene-test.json',
    );
    expect(existsSync(sessionPath)).toBe(true);
    const session = JSON.parse(readFileSync(sessionPath, 'utf-8'));
    expect(session.reportFileName).toBe(firstReportFileName);
    expect(session.reportPath).toContain(
      join('midscene_run', 'report', `${firstReportFileName}.html`),
    );

    const actionTools = new FakeCliTools();
    await actionTools.initTools();
    const actTool = actionTools
      .getToolDefinitions()
      .find((tool) => tool.name === 'act');
    expect(actTool).toBeDefined();

    await actTool!.handler({ prompt: 'click the button' });

    expect(actionTools.createdReportFileNames).toEqual([firstReportFileName]);
    expect(actionTools.createdReportGroupIds).toEqual([firstReportFileName]);
    expect(actionTools.aiAction).toHaveBeenCalledWith('click the button', {
      deepThink: false,
    });
  });

  it('creates a different report file for each connect call', async () => {
    const firstTools = new FakeCliTools();
    await firstTools.initTools();
    await firstTools
      .getToolDefinitions()
      .find((tool) => tool.name === 'test_connect')!
      .handler({});

    const secondTools = new FakeCliTools();
    await secondTools.initTools();
    await secondTools
      .getToolDefinitions()
      .find((tool) => tool.name === 'test_connect')!
      .handler({});

    expect(firstTools.createdReportFileNames[0]).toBeDefined();
    expect(secondTools.createdReportFileNames[0]).toBeDefined();
    expect(secondTools.createdReportFileNames[0]).not.toBe(
      firstTools.createdReportFileNames[0],
    );
  });

  it('refreshes the report file even when connect fails to create an agent', async () => {
    const failingTools = new FakeCliTools(true);
    await failingTools.initTools();
    const connectTool = failingTools
      .getToolDefinitions()
      .find((tool) => tool.name === 'test_connect');

    await expect(connectTool!.handler({})).rejects.toThrow('connect failed');

    const sessionPath = join(
      tempDir,
      'midscene_run',
      'cli-report-session',
      'midscene-test.json',
    );
    const session = JSON.parse(readFileSync(sessionPath, 'utf-8'));
    expect(session.reportFileName).toMatch(/^midscene-test-test-device-/);
    expect(failingTools.createdReportFileNames).toEqual([
      session.reportFileName,
    ]);
    expect(failingTools.createdReportGroupIds).toEqual([
      session.reportFileName,
    ]);
  });
});
