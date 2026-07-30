import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Agent } from '@/agent';
import { createExtraActionExecutionOptions } from '@/agent/extra-actions';
import { TaskExecutor } from '@/agent/tasks';
import { getMidsceneLocationSchema } from '@/ai-model';
import { getModelRuntime } from '@/ai-model/models';
import { genericXmlPlan } from '@/ai-model/workflows/planning';
import type { AbstractInterface } from '@/device';
import { ScreenshotItem } from '@/screenshot-item';
import type { DeviceAction } from '@/types';
import yaml from 'js-yaml';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type Service from '../../src';

vi.mock('@/ai-model/workflows/planning', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@/ai-model/workflows/planning')>();
  return {
    ...original,
    genericXmlPlan: vi.fn(),
  };
});

const validBase64Image =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const modelRuntime = () =>
  getModelRuntime({
    modelName: 'mock-model',
    modelDescription: 'mock-model',
    intent: 'default',
    slot: 'default',
  });

describe('aiAct extra action integration', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('expands an extra Input action and executes the underlying action', async () => {
    const inputCall = vi.fn();
    const inputAction: DeviceAction = {
      name: 'Input',
      description: 'Input text into an element',
      interfaceAlias: 'aiInput',
      paramSchema: z.object({
        value: z.string(),
        locate: getMidsceneLocationSchema(),
      }),
      call: inputCall,
      delayBeforeRunner: 0,
      delayAfterRunner: 0,
    };
    const extraPlanningAction: DeviceAction = {
      name: 'MidsceneExtraAction_1',
      description: 'Run a recorded action',
      call: vi.fn(),
    };
    const mockInterface = {
      interfaceType: 'web',
      actionSpace: () => [inputAction],
      cacheFeatureForPoint: vi.fn().mockResolvedValue(undefined),
    } as unknown as AbstractInterface;
    const mockService = {
      contextRetrieverFn: vi.fn().mockResolvedValue({
        screenshot: ScreenshotItem.create(validBase64Image, Date.now()),
        shotSize: { width: 1, height: 1 },
        shrunkShotToLogicalRatio: 1,
        tree: {
          id: 'root',
          attributes: {},
          children: [],
        },
      }),
    } as unknown as Service;
    const taskExecutor = new TaskExecutor(mockInterface, mockService, {
      replanningCycleLimit: 1,
      actionSpace: [inputAction],
    });
    vi.mocked(genericXmlPlan).mockResolvedValue({
      actions: [
        {
          type: extraPlanningAction.name,
          param: {},
          thought: 'fill the username',
        },
      ],
      yamlFlow: [{ MidsceneExtraAction_1: {} }],
      shouldContinuePlanning: false,
    } as any);

    const extraActions = [
      {
        name: '填写用户名',
        planningAction: extraPlanningAction,
        plans: [
          {
            type: 'Input',
            param: {
              value: 'Alice',
              locate: {
                prompt: '填写用户名',
                locatedPixelBbox: [0, 0, 1, 1],
              },
            },
          },
        ],
      },
    ];

    const result = await taskExecutor.action(
      '填写表单',
      modelRuntime(),
      modelRuntime(),
      false,
      {
        extraActions: createExtraActionExecutionOptions(extraActions),
      },
    );

    expect(vi.mocked(genericXmlPlan).mock.calls[0][1].actionSpace).toEqual([
      inputAction,
      extraPlanningAction,
    ]);
    expect(inputCall).toHaveBeenCalledOnce();
    expect(inputCall.mock.calls[0][0]).toMatchObject({
      value: 'Alice',
      locate: {
        center: expect.any(Array),
        rect: expect.objectContaining({
          left: expect.any(Number),
          top: expect.any(Number),
          width: expect.any(Number),
          height: expect.any(Number),
        }),
      },
    });

    const replayAction = vi.fn();
    const replayAgent = {
      callActionInActionSpace: replayAction,
      getActionSpace: vi.fn().mockResolvedValue([inputAction]),
      onTaskStartTip: undefined,
    };
    await Agent.prototype.runYaml.call(
      replayAgent as any,
      yaml.dump({
        tasks: [
          {
            name: 'cached extra action',
            flow: result.output?.yamlFlow,
          },
        ],
      }),
    );
    expect(replayAction).toHaveBeenCalledWith(
      'Input',
      expect.objectContaining({
        value: 'Alice',
        locate: expect.objectContaining({ prompt: '填写用户名' }),
      }),
    );
  });

  it('loads files through the public aiAct option and separates its plan cache', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'midscene-ai-act-extra-action-'));
    const filePath = join(dir, 'extra-action.yaml');
    await writeFile(
      filePath,
      `name: 点击确定按钮
actionName: tap
actionParam:
  - xpath: /path/to/#confirm-button
`,
    );

    try {
      const tapAction: DeviceAction = {
        name: 'Tap',
        description: 'Tap an element',
        call: vi.fn(),
      };
      const agent = Object.create(Agent.prototype) as Agent<any>;
      const action = vi.fn().mockResolvedValue({
        output: {
          output: 'done',
          yamlFlow: [],
        },
      });
      const matchPlanCache = vi.fn();
      (agent as any).opts = {};
      (agent as any).interface = { interfaceType: 'web' };
      (agent as any).fullActionSpace = [tapAction];
      (agent as any).taskExecutor = { action };
      (agent as any).taskCache = {
        matchPlanCache,
        isCacheResultUsed: true,
        updateOrAppendCacheRecord: vi.fn(),
      };
      (agent as any).resolveModelRuntime = vi.fn(() => modelRuntime());
      (agent as any).resolveReplanningCycleLimit = vi.fn(() => 1);

      await expect(
        agent.aiAct('填写表单', { loadExtraActions: [filePath] }),
      ).resolves.toBe('done');

      expect(matchPlanCache.mock.calls[0][0]).toContain(
        '<midscene_extra_actions>',
      );
      expect(matchPlanCache.mock.calls[0][0]).toContain(
        '"name":"点击确定按钮"',
      );
      const executionOptions = action.mock.calls[0].at(-1);
      expect(executionOptions).toEqual(
        expect.objectContaining({
          extraActions: expect.objectContaining({
            actionSpace: [
              expect.objectContaining({
                name: 'MidsceneExtraAction_1',
                description: expect.stringContaining('点击确定按钮'),
              }),
            ],
            expandPlans: expect.any(Function),
          }),
        }),
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects loadExtraActions before planning with a custom adapter', async () => {
    const agent = Object.create(Agent.prototype) as Agent<any>;
    const action = vi.fn();
    const customPlanningModel = {
      ...modelRuntime(),
      config: {
        ...modelRuntime().config,
        modelFamily: 'custom-test',
      },
      adapter: {
        planning: {
          kind: 'custom',
        },
      },
    } as any;
    (agent as any).opts = {};
    (agent as any).interface = { interfaceType: 'web' };
    (agent as any).fullActionSpace = [];
    (agent as any).taskExecutor = { action };
    (agent as any).resolveModelRuntime = vi.fn((intent: string) =>
      intent === 'planning' ? customPlanningModel : modelRuntime(),
    );

    await expect(
      agent.aiAct('填写表单', {
        loadExtraActions: ['/path/that/does/not/need/to/exist.yaml'],
      }),
    ).rejects.toThrow(
      'The "loadExtraActions" option is not supported by custom planning adapters (modelFamily: custom-test)',
    );
    expect(action).not.toHaveBeenCalled();
  });
});
