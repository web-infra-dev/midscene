import type {
  ExecutionDump,
  ExecutionTask,
  GroupedActionDump,
} from '@midscene/core';
import { describe, expect, it } from 'vitest';
import { flattenGroupedDumpTasks } from './flatten-tasks';

const makeTask = (id: string): ExecutionTask =>
  ({ taskId: id }) as unknown as ExecutionTask;

const makeExecution = (taskIds: string[]): ExecutionDump =>
  ({
    name: `exec-${taskIds.join('-')}`,
    tasks: taskIds.map(makeTask),
  }) as unknown as ExecutionDump;

const makeDump = (executionTaskIds: string[][]): GroupedActionDump =>
  ({
    groupName: 'group',
    groupDescription: 'desc',
    executions: executionTaskIds.map(makeExecution),
  }) as unknown as GroupedActionDump;

describe('flattenGroupedDumpTasks', () => {
  it('returns an empty array when groupedDump is null', () => {
    expect(flattenGroupedDumpTasks(null)).toEqual([]);
  });

  it('returns an empty array when no executions are present', () => {
    expect(flattenGroupedDumpTasks(makeDump([]))).toEqual([]);
  });

  it('flattens tasks across executions while preserving order', () => {
    const dump = makeDump([['a1', 'a2'], ['b1'], ['c1', 'c2', 'c3']]);

    const result = flattenGroupedDumpTasks(dump);

    expect(result).toHaveLength(6);
    expect(result.map((t) => (t as any).taskId)).toEqual([
      'a1',
      'a2',
      'b1',
      'c1',
      'c2',
      'c3',
    ]);
  });

  it('returns referentially identical task instances (no cloning)', () => {
    const sharedTask = makeTask('shared');
    const dump = {
      executions: [{ tasks: [sharedTask] }],
    } as unknown as GroupedActionDump;

    const result = flattenGroupedDumpTasks(dump);

    expect(result[0]).toBe(sharedTask);
  });

  it('produces equal output for repeated calls so memoization is meaningful', () => {
    const dump = makeDump([['a', 'b'], ['c']]);

    const first = flattenGroupedDumpTasks(dump);
    const second = flattenGroupedDumpTasks(dump);

    expect(second).toEqual(first);
    expect(second).toHaveLength(3);
  });
});
