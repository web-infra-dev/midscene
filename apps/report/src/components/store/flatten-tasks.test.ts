import type {
  ExecutionDump,
  ExecutionTask,
  GroupedActionDump,
} from '@midscene/core';
import { describe, expect, it } from 'vitest';
import { flattenGroupedDumpTasks } from './flatten-tasks';

const makeTask = (id: string): ExecutionTask =>
  ({ taskId: id }) as unknown as ExecutionTask;

const makeExecution = (taskIds: string[], logTime?: number): ExecutionDump =>
  ({
    logTime,
    name: `exec-${taskIds.join('-')}`,
    tasks: taskIds.map(makeTask),
  }) as unknown as ExecutionDump;

const makeDump = (
  executionTaskIds: string[][],
  logTimes?: number[],
): GroupedActionDump =>
  ({
    groupName: 'group',
    groupDescription: 'desc',
    executions: executionTaskIds.map((taskIds, index) =>
      makeExecution(taskIds, logTimes?.[index]),
    ),
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

  it('flattens tasks in execution logTime order', () => {
    const dump = makeDump(
      [['later'], ['earlier'], ['middle']],
      [300, 100, 200],
    );

    const result = flattenGroupedDumpTasks(dump);

    expect(result.map((t) => (t as any).taskId)).toEqual([
      'earlier',
      'middle',
      'later',
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
