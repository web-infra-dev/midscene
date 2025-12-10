import { describe, expect, it } from 'vitest';
import type { ExecutionTask } from '@/types';

/**
 * Test to verify generateProgressMessages includes Planning tasks
 * This is a simplified test that mimics the logic in agent.ts:generateProgressMessages
 */

// Import the utility functions
import { paramStr, typeStr } from '@/agent/ui-utils';

describe('Progress Messages Generation', () => {
  it('should include Planning tasks in progress messages', () => {
    // Mock tasks array similar to what would be in an execution
    const mockTasks: ExecutionTask[] = [
      {
        type: 'Planning',
        subType: 'Plan',
        status: 'finished',
        param: {
          userInstruction: '在搜索框中输入"杭州天气"',
        },
        output: {
          log: '在搜索框中输入"杭州天气"',
        },
        timing: { start: 1000 },
      } as any,
      {
        type: 'Locate',
        status: 'finished',
        param: { prompt: '百度搜索框' },
        timing: { start: 2000 },
      } as any,
      {
        type: 'Input',
        status: 'finished',
        param: { value: '杭州天气' },
        timing: { start: 3000 },
      } as any,
      {
        type: 'Planning',
        subType: 'Plan',
        status: 'finished',
        param: {
          userInstruction: '点击"百度一下"按钮进行搜索',
        },
        output: {
          log: '点击"百度一下"按钮进行搜索',
        },
        timing: { start: 4000 },
      } as any,
    ];

    // Simulate generateProgressMessages logic
    const progressMessages = mockTasks.map((task, index) => {
      const action = typeStr(task);
      const description = paramStr(task) || '';
      const taskStatus = task.status;
      const status: 'pending' | 'running' | 'finished' | 'failed' =
        taskStatus === 'cancelled' ? 'failed' : (taskStatus as any);

      return {
        id: `progress-task-${index}-${Date.now()}`,
        taskId: `task-${index}`,
        action,
        description,
        status,
        timestamp: task.timing?.start || Date.now(),
      };
    });

    // Verify all tasks are included
    expect(progressMessages).toHaveLength(4);

    // Verify Planning tasks are present
    const planningMessages = progressMessages.filter(
      (msg) => msg.action === 'Plan',
    );
    expect(planningMessages).toHaveLength(2);

    // Verify Planning task descriptions
    expect(planningMessages[0].description).toBe('在搜索框中输入"杭州天气"');
    expect(planningMessages[1].description).toBe(
      '点击"百度一下"按钮进行搜索',
    );

    // Verify other tasks are also present
    expect(progressMessages[1].action).toBe('Locate');
    expect(progressMessages[2].action).toBe('Input');
  });

  it('should handle Planning tasks without output.log', () => {
    const mockTasks: ExecutionTask[] = [
      {
        type: 'Planning',
        subType: 'Plan',
        status: 'running',
        param: {
          userInstruction: '搜索杭州天气',
        },
        timing: { start: 1000 },
      } as any,
    ];

    const progressMessages = mockTasks.map((task, index) => {
      const action = typeStr(task);
      const description = paramStr(task) || '';

      return {
        id: `progress-task-${index}-${Date.now()}`,
        taskId: `task-${index}`,
        action,
        description,
        status: task.status as any,
        timestamp: task.timing?.start || Date.now(),
      };
    });

    expect(progressMessages).toHaveLength(1);
    expect(progressMessages[0].action).toBe('Plan');
    // Should fall back to userInstruction when output.log is not available
    expect(progressMessages[0].description).toBe('搜索杭州天气');
  });
});
