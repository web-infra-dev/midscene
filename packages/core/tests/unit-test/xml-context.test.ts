import { TaskBuilder } from '@/agent/task-builder';
import { TaskExecutor } from '@/agent/tasks';
import { AbstractInterface } from '@/device';
import { ScreenshotItem } from '@/screenshot-item';
import type { DeviceAction, PlanningAction } from '@/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type Service from '../../src';

vi.mock('@/ai-model/llm-planning', () => ({
  plan: vi.fn(),
}));

import { plan } from '@/ai-model/llm-planning';

const validBase64Image =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

class MockInterface extends AbstractInterface {
  interfaceType = 'mock';

  getExtraPlanningContext = vi.fn(async () => '\n<ExtraXml />');

  constructor(private readonly actions: DeviceAction[] = []) {
    super();
  }

  async screenshotBase64(): Promise<string> {
    return validBase64Image;
  }

  async size(): Promise<{ width: number; height: number }> {
    return { width: 100, height: 100 };
  }

  actionSpace(): DeviceAction[] {
    return this.actions;
  }
}

const createUiContext = () => ({
  screenshot: ScreenshotItem.create(validBase64Image, Date.now()),
  shotSize: { width: 100, height: 100 },
  shrunkShotToLogicalRatio: 1,
  tree: {
    id: 'root',
    attributes: {},
    children: [],
  },
});

describe('xmlContext', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes the planning XML policy to the device hook and records actual aiActContext', async () => {
    const mockInterface = new MockInterface();
    const mockService = {
      contextRetrieverFn: vi.fn().mockResolvedValue(createUiContext()),
    } as unknown as Service;
    const taskExecutor = new TaskExecutor(mockInterface, mockService, {
      replanningCycleLimit: 1,
      actionSpace: [],
    });

    vi.mocked(plan).mockResolvedValue({
      actions: [],
      yamlFlow: [],
      shouldContinuePlanning: false,
      log: '',
      rawResponse: '',
      finalizeSuccess: true,
      finalizeMessage: 'done',
    });

    const { runner } = await taskExecutor.action(
      'do the task',
      { modelName: 'planning-model' } as any,
      { modelName: 'default-model' } as any,
      true,
      'base context',
      undefined,
      undefined,
      undefined,
      true,
      undefined,
      undefined,
      {
        planning: { xml: true },
      },
    );

    expect(mockInterface.getExtraPlanningContext).toHaveBeenCalledWith({
      intent: 'planning',
      xmlContext: { xml: true },
    });
    expect(vi.mocked(plan).mock.calls[0][1].actionContext).toBe(
      'base context\n<ExtraXml />',
    );
    expect(runner.tasks[0].param).toMatchObject({
      extraPlanningContext: '\n<ExtraXml />',
      actualAiActContext: 'base context\n<ExtraXml />',
      xmlContext: {
        planning: { xml: true },
      },
    });
  });

  it('skips the planning device hook when planning XML is disabled', async () => {
    const mockInterface = new MockInterface();
    const mockService = {
      contextRetrieverFn: vi.fn().mockResolvedValue(createUiContext()),
    } as unknown as Service;
    const taskExecutor = new TaskExecutor(mockInterface, mockService, {
      replanningCycleLimit: 1,
      actionSpace: [],
    });

    vi.mocked(plan).mockResolvedValue({
      actions: [],
      yamlFlow: [],
      shouldContinuePlanning: false,
      log: '',
      rawResponse: '',
      finalizeSuccess: true,
      finalizeMessage: 'done',
    });

    const { runner } = await taskExecutor.action(
      'do the task',
      { modelName: 'planning-model' } as any,
      { modelName: 'default-model' } as any,
      true,
      'base context',
      undefined,
      undefined,
      undefined,
      true,
      undefined,
      undefined,
      {
        planning: { xml: false },
      },
    );

    expect(mockInterface.getExtraPlanningContext).not.toHaveBeenCalled();
    expect(vi.mocked(plan).mock.calls[0][1].actionContext).toBe('base context');
    expect(runner.tasks[0].param).toMatchObject({
      actualAiActContext: 'base context',
      xmlContext: {
        planning: { xml: false },
      },
    });
  });

  it('passes the locate XML policy to the device hook and service locate request', async () => {
    const mockInterface = new MockInterface();
    const mockService = {
      contextRetrieverFn: vi.fn(),
      locate: vi.fn().mockResolvedValue({
        element: {
          center: [5, 5],
          rect: { left: 0, top: 0, width: 10, height: 10 },
          text: 'Save',
        },
      }),
    } as unknown as Service;
    const taskBuilder = new TaskBuilder({
      interfaceInstance: mockInterface,
      service: mockService,
      actionSpace: [],
    });
    const plans: PlanningAction[] = [
      {
        type: 'Locate',
        thought: '',
        param: { prompt: 'Save' },
      },
    ];

    const { tasks } = await taskBuilder.build(plans, {} as any, {} as any, {
      xmlContext: {
        locate: { xml: true },
      },
    });
    const task = {
      ...tasks[0],
      timing: {},
    } as any;

    await tasks[0].executor(tasks[0].param, {
      task,
      uiContext: createUiContext(),
    } as any);

    expect(mockInterface.getExtraPlanningContext).toHaveBeenCalledWith({
      intent: 'locate',
      xmlContext: { xml: true },
    });
    expect(mockService.locate).toHaveBeenCalledWith(
      expect.objectContaining({
        extraLocateContext: '\n<ExtraXml />',
        actualAiActContext: '\n<ExtraXml />',
      }),
      expect.objectContaining({
        extraLocateContext: '\n<ExtraXml />',
      }),
      expect.anything(),
      undefined,
    );
    expect(task.param).toMatchObject({
      extraLocateContext: '\n<ExtraXml />',
      actualAiActContext: '\n<ExtraXml />',
      xmlContext: {
        locate: { xml: true },
      },
    });
  });

  it('skips the locate device hook when locate XML is disabled', async () => {
    const mockInterface = new MockInterface();
    const mockService = {
      contextRetrieverFn: vi.fn(),
      locate: vi.fn().mockResolvedValue({
        element: {
          center: [5, 5],
          rect: { left: 0, top: 0, width: 10, height: 10 },
          text: 'Save',
        },
      }),
    } as unknown as Service;
    const taskBuilder = new TaskBuilder({
      interfaceInstance: mockInterface,
      service: mockService,
      actionSpace: [],
    });
    const plans: PlanningAction[] = [
      {
        type: 'Locate',
        thought: '',
        param: { prompt: 'Save' },
      },
    ];

    const { tasks } = await taskBuilder.build(plans, {} as any, {} as any, {
      xmlContext: {
        locate: { xml: false },
      },
    });
    const task = {
      ...tasks[0],
      timing: {},
    } as any;

    await tasks[0].executor(tasks[0].param, {
      task,
      uiContext: createUiContext(),
    } as any);

    expect(mockInterface.getExtraPlanningContext).not.toHaveBeenCalled();
    expect(mockService.locate).toHaveBeenCalledWith(
      expect.not.objectContaining({
        extraLocateContext: expect.anything(),
        actualAiActContext: expect.anything(),
      }),
      expect.not.objectContaining({
        extraLocateContext: expect.anything(),
      }),
      expect.anything(),
      undefined,
    );
    expect(task.param).toMatchObject({
      xmlContext: {
        locate: { xml: false },
      },
    });
    expect(task.param).not.toHaveProperty('extraLocateContext');
    expect(task.param).not.toHaveProperty('actualAiActContext');
  });
});
