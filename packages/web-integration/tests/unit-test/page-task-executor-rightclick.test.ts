import type { DeviceAction, PlanningAction } from '@midscene/core';
import { TaskExecutor } from '@midscene/core/agent';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock page with mouse operations
const mockPage = {
  interfaceType: 'puppeteer',
  mouse: {
    click: vi.fn().mockResolvedValue(undefined),
  },
  screenshotBase64: vi.fn().mockResolvedValue('mock-screenshot'),
  evaluateJavaScript: vi.fn(),
  actionSpace: () =>
    [
      {
        name: 'RightClick',
        call: (param, context) => {
          if (!context.element) {
            throw new Error('Element not found');
          }
          mockPage.mouse.click(
            context.element.center[0],
            context.element.center[1],
            { button: 'right' },
          );
        },
      },
    ] as DeviceAction[],
} as any;

// Mock insight
const mockInsight = {
  contextRetrieverFn: vi.fn().mockResolvedValue({
    screenshotBase64: 'mock-screenshot',
    size: { width: 1024, height: 768 },
    tree: { node: null, children: [] },
  }),
} as any;

describe('TaskExecutor RightClick Action', () => {
  let taskExecutor: TaskExecutor;

  beforeEach(() => {
    vi.clearAllMocks();
    taskExecutor = new TaskExecutor(mockPage, mockInsight, {});
  });

  it('should execute RightClick action correctly', async () => {
    const rightClickPlan: PlanningAction = {
      type: 'RightClick',
      param: null,
      thought: 'Right click on the element to open context menu',
      locate: {
        prompt: 'button to right click',
        id: 'test-element-id',
      },
    };

    // Test plan conversion instead of full execution
    const { tasks } = await (taskExecutor as any).convertPlanToExecutable([
      rightClickPlan,
    ]);

    expect(tasks).toHaveLength(1);
    expect(tasks[0].type).toBe('Action');
    expect(tasks[0].subType).toBe('RightClick');
    expect(tasks[0].thought).toBe(
      'Right click on the element to open context menu',
    );
  });

  it('should handle RightClick with locate plan', async () => {
    const locatePlan: PlanningAction = {
      type: 'Locate',
      param: {
        prompt: 'context menu trigger',
        id: 'trigger-element',
      },
      thought: 'Locate the element to right click',
      locate: {
        prompt: 'context menu trigger',
        id: 'trigger-element',
      },
    };

    const rightClickPlan: PlanningAction = {
      type: 'RightClick',
      param: null,
      thought: 'Right click to open context menu',
      locate: {
        prompt: 'context menu trigger',
        id: 'trigger-element',
      },
    };

    const plans = [locatePlan, rightClickPlan];

    // Convert plans to executable tasks
    const { tasks } = await (taskExecutor as any).convertPlanToExecutable(
      plans,
    );

    expect(tasks).toHaveLength(2);

    // First task should be Locate
    expect(tasks[0].type).toBe('Insight');
    expect(tasks[0].subType).toBe('Locate');

    // Second task should be RightClick
    expect(tasks[1].type).toBe('Action');
    expect(tasks[1].subType).toBe('RightClick');
  });

  it('should call mouse.click with right button option', async () => {
    const rightClickPlan: PlanningAction = {
      type: 'RightClick',
      param: null,
      thought: 'Right click test',
      locate: {
        prompt: 'test element',
        id: 'test-id',
      },
    };

    const { tasks } = await (taskExecutor as any).convertPlanToExecutable([
      rightClickPlan,
    ]);
    const rightClickTask = tasks[0];

    // Mock element for executor context
    const mockElement = {
      id: 'test-id',
      center: [150, 250] as [number, number],
      rect: { left: 140, top: 240, width: 20, height: 20 },
      attributes: { nodeType: 'ELEMENT_NODE' },
      xpaths: ['//*[@id="test-id"]'],
    };

    const mockContext = {
      task: {
        recorder: [],
        status: 'running' as const,
      },
      element: mockElement,
    };

    // Execute the right click task
    await rightClickTask.executor(null, mockContext);

    // Verify mouse.click was called with right button
    expect(mockPage.mouse.click).toHaveBeenCalledWith(
      150, // x coordinate
      250, // y coordinate
      { button: 'right' }, // right button option
    );
  });

  it('should throw error when element is not found for RightClick', async () => {
    const rightClickPlan: PlanningAction = {
      type: 'RightClick',
      param: null,
      thought: 'Right click test',
      locate: {
        prompt: 'non-existent element',
        id: 'non-existent-id',
      },
    };

    const { tasks } = await (taskExecutor as any).convertPlanToExecutable([
      rightClickPlan,
    ]);
    const rightClickTask = tasks[0];

    const mockContext = {
      task: {
        recorder: [],
        status: 'running' as const,
      },
      element: null, // No element found
    };

    // Should throw error when element is null
    await expect(rightClickTask.executor(null, mockContext)).rejects.toThrow();
  });
});
