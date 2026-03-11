import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseDumpScript } from '@/dump/html-utils';
import { ScreenshotItem } from '@/screenshot-item';
import { exportSessionReport } from '@/session-report';
import { SessionStore } from '@/session-store';
import {
  ExecutionDump,
  GroupedActionDump,
  type IGroupedActionDump,
  type UIContext,
} from '@/types';
import { MIDSCENE_RUN_DIR } from '@midscene/shared/env';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function fakeScreenshot(label: string): ScreenshotItem {
  return ScreenshotItem.create(
    `data:image/png;base64,${Buffer.from(label).toString('base64')}`,
    Date.now(),
  );
}

function createShardDump(options: {
  groupName: string;
  modelBrief: string;
  executionName: string;
  prompt: string;
}): GroupedActionDump {
  return new GroupedActionDump({
    sdkVersion: '1.0.0-test',
    groupName: options.groupName,
    groupDescription: 'session-test',
    modelBriefs: [options.modelBrief],
    deviceType: 'web',
    executions: [
      new ExecutionDump({
        logTime: Date.now(),
        name: options.executionName,
        tasks: [
          {
            type: 'Insight' as const,
            subType: 'Locate',
            status: 'finished' as const,
            param: { prompt: options.prompt },
            taskId: `${options.executionName}-task`,
            uiContext: {
              screenshot: fakeScreenshot(options.executionName),
              shotSize: { width: 1280, height: 720 },
              shrunkShotToLogicalRatio: 1,
            } as unknown as UIContext,
            executor: async () => undefined,
            recorder: [],
          },
        ],
      }),
    ],
  });
}

describe('SessionStore + exportSessionReport', () => {
  let runDir: string;

  beforeEach(() => {
    runDir = join(tmpdir(), `midscene-session-test-${Date.now()}`);
    vi.stubEnv(MIDSCENE_RUN_DIR, runDir);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(runDir, { recursive: true, force: true });
  });

  it('upserts the same execution key without growing execution count', () => {
    const sessionId = 'session-upsert';

    SessionStore.ensureSession({
      sessionId,
      platform: 'web',
      groupName: 'Session Upsert',
    });

    const first = SessionStore.upsertExecution({
      sessionId,
      executionKey: 'command-1:0',
      groupedDump: createShardDump({
        groupName: 'Session Upsert',
        modelBrief: 'planner/model-a',
        executionName: 'first-version',
        prompt: 'first prompt',
      }),
    });
    SessionStore.saveExecutionOrder(sessionId, 'command-1:0', first.order);

    const second = SessionStore.upsertExecution({
      sessionId,
      executionKey: 'command-1:0',
      groupedDump: createShardDump({
        groupName: 'Session Upsert',
        modelBrief: 'planner/model-a',
        executionName: 'updated-version',
        prompt: 'updated prompt',
      }),
    });
    SessionStore.saveExecutionOrder(sessionId, 'command-1:0', second.order);

    const session = SessionStore.load(sessionId);
    const dump = SessionStore.buildSessionDump(sessionId);

    expect(session.executionCount).toBe(1);
    expect(dump.executions).toHaveLength(1);
    expect(dump.executions[0].name).toBe('updated-version');
  });

  it('exports a merged report from persisted session shards', () => {
    const sessionId = 'session-export';

    SessionStore.ensureSession({
      sessionId,
      platform: 'web',
      groupName: 'Merged Session',
      groupDescription: 'export test',
    });

    const first = SessionStore.upsertExecution({
      sessionId,
      executionKey: 'command-1:0',
      groupedDump: createShardDump({
        groupName: 'Merged Session',
        modelBrief: 'planner/model-a',
        executionName: 'first execution',
        prompt: 'open page',
      }),
    });
    SessionStore.saveExecutionOrder(sessionId, 'command-1:0', first.order);

    const second = SessionStore.upsertExecution({
      sessionId,
      executionKey: 'command-2:0',
      groupedDump: createShardDump({
        groupName: 'Merged Session',
        modelBrief: 'action/model-b',
        executionName: 'second execution',
        prompt: 'click button',
      }),
    });
    SessionStore.saveExecutionOrder(sessionId, 'command-2:0', second.order);

    const reportPath = exportSessionReport(sessionId);
    const html = readFileSync(reportPath, 'utf-8');
    const dump = JSON.parse(parseDumpScript(html)) as IGroupedActionDump;

    expect(dump.groupName).toBe('Merged Session');
    expect(dump.executions).toHaveLength(2);
    expect(dump.modelBriefs).toEqual(
      expect.arrayContaining(['planner/model-a', 'action/model-b']),
    );
    expect(
      (
        dump.executions[0].tasks[0].uiContext as {
          screenshot?: { base64: string };
        }
      ).screenshot?.base64,
    ).toContain('data:image/png;base64,');
    expect(SessionStore.load(sessionId).reportFilePath).toBe(reportPath);
  });
});
