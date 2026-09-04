import {
  buildDeepAssertScreenshots,
  buildEvaluationContext,
  citationForContextTask,
  composeAssertThought,
  deepAssertEvidence,
  normalizeActionEvidenceOptions,
  normalizeAssertEvidenceOptions,
  recentAssertionExecutions,
  resolveAssertCallArgs,
  selectAssertionEvidenceImages,
} from '@/agent/assertion-evidence';
import { ScreenshotItem } from '@/screenshot-item';
import type { ExecutionTask, IExecutionDump } from '@/types';
import { describe, expect, it } from '@rstest/core';

const shot = (base64: string, capturedAt: number) =>
  ScreenshotItem.create(base64, capturedAt);

const actionTask = (
  recorder: Array<{ timing: string; screenshot: ScreenshotItem }>,
  extra?: Partial<ExecutionTask>,
): ExecutionTask =>
  ({
    taskId: extra?.taskId || 'action-1',
    type: 'Action Space',
    subType: extra?.subType || 'Tap',
    status: extra?.status || 'finished',
    thought: extra?.thought || 'tap submit',
    param: extra?.param || { description: 'submit button' },
    recorder: recorder.map((item) => ({
      type: 'screenshot' as const,
      ts: item.screenshot.capturedAt,
      screenshot: item.screenshot,
      timing: item.timing,
    })),
    ...extra,
  }) as ExecutionTask;

const planningTask = (extra?: Partial<ExecutionTask>): ExecutionTask =>
  ({
    taskId: extra?.taskId || 'plan-1',
    type: 'Planning',
    subType: extra?.subType || 'Plan',
    status: extra?.status || 'finished',
    param: extra?.param || { userInstructionDisplay: 'open settings' },
    output: extra?.output || {
      shouldContinuePlanning: false,
      actions: [{ type: 'Tap' }],
    },
    ...extra,
  }) as ExecutionTask;

const assertTask = (extra?: Partial<ExecutionTask>): ExecutionTask =>
  ({
    taskId: extra?.taskId || 'assert-1',
    type: 'Insight',
    subType: 'Assert',
    status: extra?.status || 'finished',
    param: extra?.param || { assertion: 'done' },
    ...extra,
  }) as ExecutionTask;

const execution = (
  id: string,
  name: string,
  tasks: ExecutionTask[],
): IExecutionDump => ({
  id,
  name,
  tasks,
});

describe('assertion evidence options', () => {
  it('accepts evidence-chain options as the second argument', () => {
    const resolved = resolveAssertCallArgs({
      deepAssert: true,
      BeforeTasks: 2,
      MaxPictures: 2,
    });
    expect(resolved.message).toBeUndefined();
    expect(resolved.options).toMatchObject({
      deepAssert: true,
      BeforeTasks: 2,
      MaxPictures: 2,
    });
  });

  it('keeps the legacy three-argument form', () => {
    const resolved = resolveAssertCallArgs('failed', {
      deepAssert: false,
    });
    expect(resolved.message).toBe('failed');
    expect(resolved.options).toMatchObject({ deepAssert: false });
  });

  it('normalizes illegal numbers to defaults', () => {
    expect(
      normalizeActionEvidenceOptions({
        AfterActPictures: -1,
        Interval: Number.NaN,
      }),
    ).toEqual({ AfterActPictures: 1, Interval: 50 });
    expect(
      normalizeAssertEvidenceOptions({
        BeforeExecutions: -3,
        BeforeTasks: Number.POSITIVE_INFINITY,
        MaxPictures: -8,
        AssertionContextBoundary: 'other' as never,
      }),
    ).toEqual({
      deepAssert: true,
      AssertionContextBoundary: 'lastAssert',
      BeforeExecutions: 1,
      BeforeTasks: 1,
      MaxPictures: 2,
    });
  });
});

describe('assertion evidence history and images', () => {
  it('passes newest unique action evidence to the model', () => {
    const beforeShot = shot('data:image/png;base64,before', 1);
    const afterShot = shot('data:image/png;base64,after', 2);
    const planningShot = shot('data:image/png;base64,planning', 3);
    const history = [
      execution('e1', 'Act - submit', [
        {
          ...planningTask(),
          recorder: [
            {
              type: 'screenshot',
              ts: 3,
              screenshot: planningShot,
              timing: 'after-calling',
            },
          ],
        },
        actionTask([
          { timing: 'before-calling', screenshot: beforeShot },
          { timing: 'after-calling-1', screenshot: afterShot },
        ]),
      ]),
    ];

    const images = selectAssertionEvidenceImages(history, 2);
    expect(images.map((image) => image.url)).toEqual([
      afterShot.base64,
      beforeShot.base64,
    ]);
    expect(images.every((image) => /before-calling|after-calling-1$/.test(image.name))).toBe(
      true,
    );
  });

  it('uses lastAssert and session boundaries', () => {
    const older = execution('old', 'Act - older', [
      actionTask([{ timing: 'before-calling', screenshot: shot('old', 1) }], {
        taskId: 'old-action',
      }),
    ]);
    const previousAssert = execution('asserted', 'Assert - previous', [
      assertTask({ taskId: 'prev-assert' }),
    ]);
    const newer = execution('new', 'Act - newer', [
      actionTask([{ timing: 'before-calling', screenshot: shot('new', 2) }], {
        taskId: 'new-action',
      }),
    ]);

    const lastAssert = recentAssertionExecutions(
      [older, previousAssert, newer],
      2,
      'lastAssert',
    );
    expect(lastAssert.map((item) => item.id)).toEqual(['new']);

    const session = recentAssertionExecutions(
      [older, previousAssert, newer],
      2,
      'session',
    );
    expect(session.map((item) => item.id)).toEqual(['asserted', 'new']);
  });

  it('keeps a contiguous recent task window and skips final planning summaries', () => {
    const history = [
      execution('e1', 'Act - flow', [
        planningTask({
          taskId: 'final-plan',
          output: { shouldContinuePlanning: false, actions: [] },
        }),
        planningTask({ taskId: 'locate', subType: 'Locate' }),
        actionTask(
          [{ timing: 'before-calling', screenshot: shot('a', 1) }],
          { taskId: 'tap' },
        ),
      ]),
    ];
    const context = buildEvaluationContext(history, 2);
    expect(context.tasks.map((task) => task.taskId)).toEqual(['locate', 'tap']);
  });
});

describe('assertion evidence report helpers', () => {
  it('returns undefined for disabled or legacy asserts', () => {
    expect(
      deepAssertEvidence(
        assertTask({ param: { assertion: 'x', deepAssert: false } }),
      ),
    ).toBeUndefined();
    expect(deepAssertEvidence(assertTask({ param: { assertion: 'x' } }))).toBeUndefined();
  });

  it('reverses model images for report display', () => {
    const screenshots = buildDeepAssertScreenshots(
      assertTask({
        param: {
          assertion: 'state is correct',
          deepAssert: true,
          assertionEvidenceImages: [
            { name: 'Act / Tap / after-calling-1', url: 'after', capturedAt: 2 },
            { name: 'Act / Tap / before-calling', url: 'before', capturedAt: 1 },
          ],
        },
      }),
    );
    expect(screenshots).toEqual([
      {
        screenshot: 'before',
        timing: '参考图1 / Act / Tap / before-calling',
        screenshotTimestamp: 1,
      },
      {
        screenshot: 'after',
        timing: '参考图2 / Act / Tap / after-calling-1',
        screenshotTimestamp: 2,
      },
    ]);
  });

  it('writes exact task citations into the four analysis sections', () => {
    const context = buildEvaluationContext(
      [
        execution('e1', 'Act - submit', [
          actionTask(
            [{ timing: 'before-calling', screenshot: shot('a', 1) }],
            { taskId: 'tap', thought: 'tap submit' },
          ),
        ]),
      ],
      1,
    );
    const thought = composeAssertThought({
      assertion: 'state is correct',
      passed: true,
      evaluationContext: context,
      evidenceImages: [
        { name: 'Act - submit / Tap / before-calling', url: 'a', capturedAt: 1 },
      ],
    });
    expect(thought).toContain('当前界面判断');
    expect(thought).toContain('关联 task 分析');
    expect(thought).toContain('截图证据分析');
    expect(thought).toContain('最终结论');
    expect(thought).toContain(citationForContextTask(context.tasks[0], 1));
    expect(thought).not.toContain('DATA_DEMAND');
  });
});
