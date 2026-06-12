import { getTaskSearchArea, getTaskServiceDump } from '@/dump';
import type { ExecutionTask, ServiceDump } from '@/types';
import { describe, expect, it } from 'vitest';

const serviceDump = {
  type: 'locate',
  taskInfo: {
    durationMs: 100,
    searchArea: { left: 10, top: 20, width: 300, height: 200 },
  },
} as ServiceDump;

describe('task service dump utilities', () => {
  it('reads the wrapped service dump from task logs', () => {
    const task = {
      log: {
        dump: serviceDump,
      },
    } as ExecutionTask;

    expect(getTaskServiceDump(task)).toBe(serviceDump);
    expect(getTaskSearchArea(task)).toEqual(serviceDump.taskInfo.searchArea);
  });

  it('prefers the explicit task searchArea when present', () => {
    const task = {
      searchArea: { left: 1, top: 2, width: 3, height: 4 },
      log: {
        dump: serviceDump,
      },
    } as ExecutionTask;

    expect(getTaskSearchArea(task)).toEqual({
      left: 1,
      top: 2,
      width: 3,
      height: 4,
    });
  });

  it('ignores direct service dump logs', () => {
    const task = {
      log: serviceDump,
    } as ExecutionTask;

    expect(getTaskServiceDump(task)).toBeNull();
  });
});
