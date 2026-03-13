import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Agent } from '@/agent/agent';
import type { AbstractInterface } from '@/device';
import { parseDumpScript } from '@/dump/html-utils';
import { exportSessionReport } from '@/execution-report';
import { ExecutionStore } from '@/execution-store';
import { ScreenshotItem } from '@/screenshot-item';
import {
  ExecutionDump,
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

function createExecutionDump(options: {
  executionName: string;
  prompt: string;
}): ExecutionDump {
  return new ExecutionDump({
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
  });
}

const mockedModelConfig = {
  MIDSCENE_MODEL_NAME: 'mock-model',
  MIDSCENE_MODEL_API_KEY: 'mock-api-key',
  MIDSCENE_MODEL_BASE_URL: 'mock-base-url',
};

function createMockInterface(): AbstractInterface {
  return {
    interfaceType: 'puppeteer',
    actionSpace: vi.fn(() => []),
    size: vi.fn().mockResolvedValue({ width: 1280, height: 720 }),
    destroy: vi.fn(),
  } as unknown as AbstractInterface;
}

describe('ExecutionStore + exportSessionReport', () => {
  let runDir: string;
  let store: ExecutionStore;

  beforeEach(() => {
    runDir = join(tmpdir(), `midscene-session-test-${Date.now()}`);
    vi.stubEnv(MIDSCENE_RUN_DIR, runDir);
    store = new ExecutionStore();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(runDir, { recursive: true, force: true });
  });

  it('overwrites the same order slot without growing execution count', () => {
    const sessionId = 'session-upsert';

    store.ensureSession({
      sessionId,
      platform: 'web',
      groupName: 'Session Upsert',
      sdkVersion: '1.0.0-test',
      modelBriefs: ['planner/model-a'],
      deviceType: 'web',
    });

    const order = store.appendExecution(
      sessionId,
      createExecutionDump({
        executionName: 'first-version',
        prompt: 'first prompt',
      }),
    );

    // Overwrite same order slot with updated execution
    store.updateExecution(
      sessionId,
      order,
      createExecutionDump({
        executionName: 'updated-version',
        prompt: 'updated prompt',
      }),
    );

    const session = store.load(sessionId);
    const dump = store.buildGroupedDump(sessionId);

    expect(session.executionCount).toBe(1);
    expect(dump.executions).toHaveLength(1);
    expect(dump.executions[0].name).toBe('updated-version');
  });

  it('persists agent metadata when Agent is created with sessionId', () => {
    const sessionId = 'agent-constructor-session';
    new Agent(createMockInterface(), {
      sessionId,
      generateReport: false,
      modelConfig: mockedModelConfig,
    });

    const persistedSession = store.load(sessionId);

    expect(existsSync(join(runDir, 'session', sessionId, 'agent.json'))).toBe(
      true,
    );
    expect(persistedSession.groupName).toBe('Midscene Report');
    expect(persistedSession.platform).toBe('puppeteer');
  });

  it('exports a merged report from persisted session shards', () => {
    const sessionId = 'session-export';

    store.ensureSession({
      sessionId,
      platform: 'web',
      groupName: 'Merged Session',
      groupDescription: 'export test',
      sdkVersion: '1.0.0-test',
      modelBriefs: ['planner/model-a', 'action/model-b'],
      deviceType: 'web',
    });

    store.appendExecution(
      sessionId,
      createExecutionDump({
        executionName: 'first execution',
        prompt: 'open page',
      }),
    );

    store.appendExecution(
      sessionId,
      createExecutionDump({
        executionName: 'second execution',
        prompt: 'click button',
      }),
    );

    const reportPath = exportSessionReport(sessionId, store);
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
    expect(store.load(sessionId).reportFilePath).toBe(reportPath);
    expect(existsSync(join(runDir, 'session', sessionId, 'agent.json'))).toBe(
      true,
    );
    expect(existsSync(join(runDir, 'session', sessionId, '1.json'))).toBe(true);
    expect(existsSync(join(runDir, 'session', sessionId, '2.json'))).toBe(true);
  });
});
