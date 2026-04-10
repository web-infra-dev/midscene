import type { ExecutionTask } from '@midscene/core';
import { describe, expect, it } from 'vitest';
import { buildTimelineScreenshots } from './build-timeline-screenshots';

interface TaskFixtureOptions {
  id: string;
  startTs?: number;
  uiContextScreenshot?: { base64: string };
  recorder?: { ts: number; base64?: string }[];
}

const makeTask = (opts: TaskFixtureOptions): ExecutionTask =>
  ({
    taskId: opts.id,
    timing: opts.startTs !== undefined ? { start: opts.startTs } : undefined,
    uiContext: opts.uiContextScreenshot
      ? { screenshot: opts.uiContextScreenshot }
      : undefined,
    recorder: opts.recorder?.map((r) => ({
      type: 'screenshot',
      ts: r.ts,
      screenshot: r.base64 !== undefined ? { base64: r.base64 } : undefined,
    })),
  }) as unknown as ExecutionTask;

describe('buildTimelineScreenshots', () => {
  it('returns empty result for empty input', () => {
    const { allScreenshots, idTaskMap, startingTime } =
      buildTimelineScreenshots([]);
    expect(allScreenshots).toEqual([]);
    expect(idTaskMap).toEqual({});
    expect(startingTime).toBe(-1);
  });

  it('drops recorder items that have no screenshot', () => {
    const task = makeTask({
      id: 'no-shot',
      startTs: 1000,
      recorder: [{ ts: 1100 }],
    });

    const { allScreenshots } = buildTimelineScreenshots([task]);

    expect(allScreenshots).toEqual([]);
  });

  it('emits a single uiContext screenshot for a task without recorders', () => {
    const task = makeTask({
      id: 'ctx-only',
      startTs: 5000,
      uiContextScreenshot: { base64: 'CTX' },
    });

    const { allScreenshots, idTaskMap, startingTime } =
      buildTimelineScreenshots([task]);

    expect(startingTime).toBe(5000);
    expect(allScreenshots).toHaveLength(1);
    expect(allScreenshots[0]).toMatchObject({
      img: 'CTX',
      timeOffset: 0,
    });
    expect(idTaskMap[allScreenshots[0].id]).toBe(task);
  });

  it('uses the earliest recorder ts as the starting time and computes offsets', () => {
    const task = makeTask({
      id: 'with-recorder',
      startTs: 2000,
      recorder: [
        { ts: 2500, base64: 'B' },
        { ts: 1800, base64: 'A' },
        { ts: 3000, base64: 'C' },
      ],
    });

    const { allScreenshots, startingTime } = buildTimelineScreenshots([task]);

    expect(startingTime).toBe(1800);
    expect(allScreenshots.map((s) => s.timeOffset)).toEqual([0, 700, 1200]);
    expect(allScreenshots.map((s) => s.img)).toEqual(['A', 'B', 'C']);
  });

  it('orders screenshots from multiple tasks by absolute time', () => {
    const taskA = makeTask({
      id: 'A',
      startTs: 1000,
      recorder: [{ ts: 1500, base64: 'A1' }],
    });
    const taskB = makeTask({
      id: 'B',
      startTs: 500,
      recorder: [
        { ts: 800, base64: 'B1' },
        { ts: 2000, base64: 'B2' },
      ],
    });

    const { allScreenshots, startingTime } = buildTimelineScreenshots([
      taskA,
      taskB,
    ]);

    expect(startingTime).toBe(500);
    expect(allScreenshots.map((s) => s.img)).toEqual(['B1', 'A1', 'B2']);
    expect(allScreenshots.map((s) => s.timeOffset)).toEqual([300, 1000, 1500]);
  });

  it('maps every emitted id back to the originating task', () => {
    const taskA = makeTask({
      id: 'A',
      startTs: 1000,
      uiContextScreenshot: { base64: 'CTX-A' },
      recorder: [{ ts: 1100, base64: 'A1' }],
    });
    const taskB = makeTask({
      id: 'B',
      startTs: 2000,
      recorder: [{ ts: 2100, base64: 'B1' }],
    });

    const { allScreenshots, idTaskMap } = buildTimelineScreenshots([
      taskA,
      taskB,
    ]);

    const taskByImg = (img: string) =>
      idTaskMap[allScreenshots.find((s) => s.img === img)!.id];

    expect(taskByImg('CTX-A')).toBe(taskA);
    expect(taskByImg('A1')).toBe(taskA);
    expect(taskByImg('B1')).toBe(taskB);
  });

  it('assigns unique ids across all emitted screenshots', () => {
    const tasks = [
      makeTask({
        id: 'A',
        startTs: 100,
        uiContextScreenshot: { base64: 'CTX' },
        recorder: [
          { ts: 110, base64: 'A1' },
          { ts: 120, base64: 'A2' },
        ],
      }),
      makeTask({
        id: 'B',
        startTs: 200,
        recorder: [{ ts: 210, base64: 'B1' }],
      }),
    ];

    const { allScreenshots } = buildTimelineScreenshots(tasks);
    const ids = allScreenshots.map((s) => s.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('produces equal output for repeated calls (allowing useMemo to short-circuit)', () => {
    const tasks = [
      makeTask({
        id: 'A',
        startTs: 1000,
        recorder: [{ ts: 1100, base64: 'A1' }],
      }),
    ];

    const first = buildTimelineScreenshots(tasks);
    const second = buildTimelineScreenshots(tasks);

    expect(second.allScreenshots).toEqual(first.allScreenshots);
    expect(second.startingTime).toBe(first.startingTime);
  });

  it('does not put dropped recorder items into idTaskMap', () => {
    const task = makeTask({
      id: 'mixed',
      startTs: 1000,
      recorder: [
        { ts: 1100, base64: 'KEEP' },
        { ts: 1200 }, // no screenshot — should be dropped from idTaskMap too
      ],
    });

    const { allScreenshots, idTaskMap } = buildTimelineScreenshots([task]);

    expect(allScreenshots).toHaveLength(1);
    expect(Object.keys(idTaskMap)).toHaveLength(1);
    expect(idTaskMap[allScreenshots[0].id]).toBe(task);
  });

  it('still uses dropped recorder ts to compute starting time', () => {
    // legacy behaviour: a recorder with no screenshot still contributes its ts
    // to startingTime so that surviving entries render at the right offset.
    const taskA = makeTask({
      id: 'A',
      startTs: 5000,
      recorder: [{ ts: 800 }], // no screenshot but earliest ts
    });
    const taskB = makeTask({
      id: 'B',
      startTs: 6000,
      recorder: [{ ts: 6100, base64: 'B1' }],
    });

    const { allScreenshots, startingTime } = buildTimelineScreenshots([
      taskA,
      taskB,
    ]);

    expect(startingTime).toBe(800);
    expect(allScreenshots).toHaveLength(1);
    expect(allScreenshots[0]).toMatchObject({
      img: 'B1',
      timeOffset: 5300, // 6100 - 800
    });
  });

  it('does not crash when a task has no timing or uiContext at all', () => {
    const task = makeTask({ id: 'bare' });

    const { allScreenshots, startingTime } = buildTimelineScreenshots([task]);

    expect(allScreenshots).toEqual([]);
    expect(startingTime).toBe(-1);
  });
});
