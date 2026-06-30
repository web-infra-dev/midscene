import type {
  ExecutionDump,
  ExecutionTask,
  GroupedActionDump,
} from '@midscene/core';
import { describe, expect, it } from 'vitest';
import { anchorIdForTask, findTaskByAnchor } from './task-anchor';

const makeTask = (id: string): ExecutionTask =>
  ({ taskId: id }) as unknown as ExecutionTask;

const makeDump = (executionTasks: ExecutionTask[][]): GroupedActionDump =>
  ({
    groupName: 'group',
    groupDescription: 'desc',
    executions: executionTasks.map(
      (tasks, index) =>
        ({ name: `exec-${index}`, tasks }) as unknown as ExecutionDump,
    ),
  }) as unknown as GroupedActionDump;

describe('anchorIdForTask', () => {
  it('builds the anchor from the taskId', () => {
    expect(anchorIdForTask(makeTask('abc-123'))).toBe('task-abc-123');
  });

  it('throws when the task has no taskId', () => {
    expect(() => anchorIdForTask({} as unknown as ExecutionTask)).toThrow(
      /taskId/,
    );
  });
});

describe('findTaskByAnchor', () => {
  it('matches by taskId, accepting a leading #', () => {
    const target = makeTask('uuid-with-dashes-1');
    const dump = makeDump([[makeTask('other'), target]]);
    expect(findTaskByAnchor(dump, '#task-uuid-with-dashes-1')).toBe(target);
    expect(findTaskByAnchor(dump, 'task-uuid-with-dashes-1')).toBe(target);
  });

  it('returns null for unknown or malformed anchors', () => {
    const dump = makeDump([[makeTask('a')]]);
    expect(findTaskByAnchor(dump, '#task-missing')).toBeNull();
    expect(findTaskByAnchor(dump, '#group-0')).toBeNull();
    expect(findTaskByAnchor(dump, '')).toBeNull();
    expect(findTaskByAnchor(null, '#task-a')).toBeNull();
  });
});
