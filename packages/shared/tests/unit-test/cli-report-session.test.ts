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
  protected getCliReportSessionName() {
    return 'midscene-test';
  }
  private pendingReportFileName?: string;
  public readonly createdReportFileNames: Array<string | undefined> = [];
  public readonly aiAction = vi.fn().mockResolvedValue(undefined);

  protected createTemporaryDevice(): BaseDevice {
    return new FakeDevice();
  }

  protected async ensureAgent(): Promise<BaseAgent> {
    const reportFileName =
      this.pendingReportFileName ?? this.readCliReportFileName();
    this.createdReportFileNames.push(reportFileName);
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
          const reportSession = this.createNewCliReportSession();
          this.pendingReportFileName = reportSession?.reportFileName;
          try {
            await this.ensureAgent();
          } finally {
            this.pendingReportFileName = undefined;
          }
          this.commitCliReportSession(reportSession);
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
    expect(firstReportFileName).toMatch(/^midscene-test-/);

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
});
