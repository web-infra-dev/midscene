import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { TaskExecutor } from '@/agent/tasks';
import { getModelRuntime } from '@/ai-model/models';
import { ScreenshotItem } from '@/screenshot-item';
import type { ExecutionTask, IExecutionDump, ServiceDump } from '@/types';
import { describe, expect, it, rs } from '@rstest/core';

const runtimeDumpPath = resolve(
  process.cwd(),
  'tests/unit-test/fixtures/deep-assert-runtime-dump.json',
);

const createMockUIContext = async (screenshotData = 'mock-screenshot') => ({
  screenshot: ScreenshotItem.create(screenshotData, Date.now()),
  shotSize: { width: 1920, height: 1080 },
  shrunkShotToLogicalRatio: 1,
});

const createMockDump = (data: unknown, thought?: string): ServiceDump => ({
  logTime: Date.now(),
  type: 'extract',
  logId: 'mock-log-id',
  userQuery: {},
  data,
  taskInfo: {
    durationMs: 100,
    rawResponse: JSON.stringify(data),
    reasoning_content: thought,
  },
});

const shot = (value: string, capturedAt: number) =>
  ScreenshotItem.create(`data:image/png;base64,${value}`, capturedAt);

const actionTask = (
  id: string,
  frames: Array<{ timing: string; screenshot: ScreenshotItem }>,
): ExecutionTask =>
  ({
    taskId: id,
    type: 'Action Space',
    subType: 'Tap',
    status: 'finished',
    thought: 'tap submit',
    param: { description: 'submit button' },
    recorder: frames.map((frame) => ({
      type: 'screenshot',
      ts: frame.screenshot.capturedAt,
      screenshot: frame.screenshot,
      timing: frame.timing,
    })),
  }) as ExecutionTask;

const planningTask = (id: string): ExecutionTask =>
  ({
    taskId: id,
    type: 'Planning',
    subType: 'Plan',
    status: 'finished',
    param: { userInstructionDisplay: 'submit the form' },
    output: {
      shouldContinuePlanning: false,
      actions: [{ type: 'Tap' }],
    },
  }) as ExecutionTask;

const modelRuntime = getModelRuntime({
  modelName: 'mock-model',
  modelDescription: 'mock-model-description',
  intent: 'insight',
  slot: 'insight',
});

const createExecutor = (
  history: IExecutionDump[],
  thought =
    '当前界面判断\n表单已提交。\n关联 task 分析\n占位\n截图证据分析\n前后界面发生变化。\n最终结论\n断言成立。',
) => {
  const extract = rs.fn(async () => ({
    data: { StatementIsTruthy: true },
    thought,
    dump: createMockDump({ StatementIsTruthy: true }, thought),
  }));
  const taskExecutor = new TaskExecutor({} as never, {
    contextRetrieverFn: rs.fn(async () => createMockUIContext('current')),
    extract,
  } as never, {
    actionSpace: [],
    getAssertionExecutions: () => history,
  });
  return { taskExecutor, extract };
};

describe('assertion evidence execution', () => {
  it('accepts evidence-chain options as the second argument and persists them', async () => {
    const { taskExecutor } = createExecutor([]);
    const { runner } = await taskExecutor.createTypeQueryExecution(
      'Assert',
      'state is correct',
      modelRuntime,
      {
        deepAssert: true,
        BeforeTasks: 2,
        MaxPictures: 2,
      },
    );
    expect(runner.tasks[0]?.param).toMatchObject({
      assertion: 'state is correct',
      deepAssert: true,
      BeforeTasks: 2,
      MaxPictures: 2,
    });
  });

  it('passes newest unique action evidence to the model', async () => {
    const beforeShot = shot('before', 1);
    const afterShot = shot('after', 2);
    const history = [
      {
        id: 'act-1',
        name: 'Act - submit',
        tasks: [
          planningTask('plan-1'),
          actionTask('tap-1', [
            { timing: 'before-calling', screenshot: beforeShot },
            { timing: 'after-calling-1', screenshot: afterShot },
          ]),
        ],
      },
    ];
    const { taskExecutor, extract } = createExecutor(history);
    const { runner } = await taskExecutor.createTypeQueryExecution(
      'Assert',
      'state is correct',
      modelRuntime,
      { deepAssert: true, MaxPictures: 2 },
    );
    expect(
      runner.tasks[0]?.param?.assertionEvidenceImages?.map((image) => image.url),
    ).toEqual([afterShot.base64, beforeShot.base64]);
    expect(extract.mock.calls[0]?.[2]?.assertionEvidenceImages?.[0]?.url).toBe(
      afterShot.base64,
    );
  });

  it('does not build an evidence chain when deepAssert is false', async () => {
    const history = [
      {
        id: 'act-1',
        name: 'Act - submit',
        tasks: [
          actionTask('tap-1', [
            { timing: 'before-calling', screenshot: shot('before', 1) },
          ]),
        ],
      },
    ];
    const { taskExecutor } = createExecutor(history);
    const { runner } = await taskExecutor.createTypeQueryExecution(
      'Assert',
      'state is correct',
      modelRuntime,
      { deepAssert: false },
    );
    expect(runner.tasks[0]?.param?.deepAssert).toBe(false);
    expect(runner.tasks[0]?.param?.assertionEvidenceImages).toBeUndefined();
  });

  it('fails the assert task when MaxPictures is 0', async () => {
    const { taskExecutor } = createExecutor([]);
    await expect(
      taskExecutor.createTypeQueryExecution(
        'Assert',
        'state is correct',
        modelRuntime,
        { deepAssert: true, MaxPictures: 0 },
      ),
    ).rejects.toThrow(/MaxPictures is 0/);
  });

  it('falls back to the current screenshot when there is no history', async () => {
    const { taskExecutor } = createExecutor([]);
    const { runner } = await taskExecutor.createTypeQueryExecution(
      'Assert',
      'state is correct',
      modelRuntime,
      { deepAssert: true, MaxPictures: 2 },
    );
    expect(runner.tasks[0]?.param?.assertionEvidenceFallback).toBe(
      'currentScreenshot',
    );
    expect(runner.tasks[0]?.param?.assertionEvidenceImages).toEqual([]);
  });

  it('writes a full AfterActPictures=3 MaxPictures=4 dump for report verification', async () => {
    const frames = [1, 2, 3, 4].map((index) =>
      shot(`frame-${index}`, index * 10),
    );
    const history: IExecutionDump[] = [
      {
        id: 'act-1',
        name: 'Act - submit form',
        tasks: [
          planningTask('plan-1'),
          actionTask('tap-1', [
            { timing: 'before-calling', screenshot: frames[0] },
            { timing: 'after-calling-1', screenshot: frames[1] },
            { timing: 'after-calling-2', screenshot: frames[2] },
            { timing: 'after-calling-3', screenshot: frames[3] },
          ]),
        ],
      },
    ];
    const { taskExecutor } = createExecutor(history);
    const { runner } = await taskExecutor.createTypeQueryExecution(
      'Assert',
      'the form is submitted',
      modelRuntime,
      {
        deepAssert: true,
        BeforeTasks: 2,
        MaxPictures: 4,
        AssertionContextBoundary: 'session',
      },
    );

    const dump = {
      executions: [history[0], runner.dump().toJSON()],
    };
    mkdirSync(dirname(runtimeDumpPath), { recursive: true });
    writeFileSync(runtimeDumpPath, JSON.stringify(dump, null, 2), 'utf8');

    expect(runner.tasks[0]?.param?.BeforeTasks).toBe(2);
    expect(runner.tasks[0]?.param?.assertionEvidenceImages?.length).toBe(4);
    expect(runner.tasks[0]?.thought).toContain('当前界面判断');
    expect(runner.tasks[0]?.thought).toContain('Task 1:');
    expect(runner.tasks[0]?.thought).toContain('Task 2:');
  });
});
