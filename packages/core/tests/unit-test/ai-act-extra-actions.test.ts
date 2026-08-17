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
          type: 'MidsceneExtraAction_1',
          param: {},
          thought: 'fill the username',
        },
      ],
      yamlFlow: [{ MidsceneExtraAction_1: {} }],
      shouldContinuePlanning: false,
    } as any);

    const extraActions = [
      {
        alias: 'MidsceneExtraAction_1',
        name: 'Fill the username',
        sourcePath: '/tmp/example.actions.yaml',
        plan: {
          type: 'Input',
          param: {
            value: 'Alice',
            locate: {
              prompt: 'Username input',
              locatedPixelBbox: [0, 0, 1, 1],
            },
          },
        },
      },
    ];

    const result = await taskExecutor.action(
      'Fill the form',
      modelRuntime(),
      modelRuntime(),
      false,
      {
        extraActions: createExtraActionExecutionOptions(
          extraActions,
          undefined,
        ),
      },
    );

    expect(vi.mocked(genericXmlPlan).mock.calls[0][1].actionSpace).toEqual([
      expect.objectContaining({
        name: 'MidsceneExtraAction_1',
        description: expect.stringContaining('Fill the username'),
      }),
      inputAction,
    ]);
    expect(vi.mocked(genericXmlPlan).mock.calls[0][1].hasExtraActions).toBe(
      true,
    );
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
        locate: expect.objectContaining({ prompt: 'Username input' }),
      }),
    );
  });

  it('refreshes disclosure on every planning round while keeping aliases stable', async () => {
    const tapCall = vi.fn();
    const tapAction: DeviceAction = {
      name: 'Tap',
      description: 'Tap an element',
      call: tapCall,
      delayBeforeRunner: 0,
      delayAfterRunner: 0,
    };
    const probeLocatorTargets = vi
      .fn()
      .mockResolvedValueOnce([true, false])
      .mockResolvedValueOnce([false, true]);
    const mockInterface = {
      interfaceType: 'web',
      actionSpace: () => [tapAction],
      probeLocatorTargets,
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
      actionSpace: [tapAction],
    });
    vi.mocked(genericXmlPlan)
      .mockResolvedValueOnce({
        actions: [
          {
            type: 'MidsceneExtraAction_1',
            param: {},
            thought: 'run the first action',
          },
        ],
        shouldContinuePlanning: true,
      } as any)
      .mockResolvedValueOnce({
        actions: [
          {
            type: 'MidsceneExtraAction_2',
            param: {},
            thought: 'run the second action',
          },
        ],
        shouldContinuePlanning: false,
      } as any);

    await taskExecutor.action(
      'Complete both steps',
      modelRuntime(),
      modelRuntime(),
      false,
      {
        extraActions: createExtraActionExecutionOptions(
          [
            {
              alias: 'MidsceneExtraAction_1',
              name: 'Run the first action',
              sourcePath: '/tmp/example.actions.yaml',
              validWhenTargetExists: {
                strategy: 'xpath',
                selector: '//button[@id="first"]',
              },
              plan: { type: 'Tap', param: undefined },
            },
            {
              alias: 'MidsceneExtraAction_2',
              name: 'Run the second action',
              sourcePath: '/tmp/example.actions.yaml',
              validWhenTargetExists: {
                strategy: 'xpath',
                selector: '//button[@id="second"]',
              },
              plan: { type: 'Tap', param: undefined },
            },
          ],
          mockInterface,
        ),
      },
    );

    expect(probeLocatorTargets).toHaveBeenCalledTimes(2);
    expect(
      vi
        .mocked(genericXmlPlan)
        .mock.calls.map((call) =>
          call[1].actionSpace.map((action) => action.name),
        ),
    ).toEqual([
      ['MidsceneExtraAction_1', 'Tap'],
      ['MidsceneExtraAction_2', 'Tap'],
    ]);
    expect(tapCall).toHaveBeenCalledTimes(2);
  });

  it('loads files through the public aiAct option and separates its plan cache', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'midscene-ai-act-extra-action-'));
    const filePath = join(dir, 'extra-action.yaml');
    await writeFile(
      filePath,
      `version: 1
interface: web
actions:
  - name: Click the confirm button
    action:
      name: tap
      param: {}
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
          yamlFlow: [{ Tap: {} }],
        },
      });
      const matchPlanCache = vi.fn();
      const updateOrAppendCacheRecord = vi.fn();
      (agent as any).opts = {};
      (agent as any).interface = { interfaceType: 'web' };
      (agent as any).fullActionSpace = [tapAction];
      (agent as any).taskExecutor = { action };
      (agent as any).taskCache = {
        matchPlanCache,
        isCacheResultUsed: true,
        updateOrAppendCacheRecord,
      };
      (agent as any).resolveModelRuntime = vi.fn(() => modelRuntime());
      (agent as any).resolveReplanningCycleLimit = vi.fn(() => 1);

      await expect(
        agent.aiAct('Fill the form', { loadExtraActions: [filePath] }),
      ).resolves.toBe('done');

      expect(matchPlanCache.mock.calls[0][0]).toContain(
        '<midscene_extra_actions>',
      );
      expect(matchPlanCache.mock.calls[0][0]).toContain(
        'extra-actions-snapshot:v1:',
      );
      expect(updateOrAppendCacheRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'plan',
          prompt: matchPlanCache.mock.calls[0][0],
        }),
        undefined,
      );
      const executionOptions = action.mock.calls[0].at(-1);
      expect(executionOptions).toEqual(
        expect.objectContaining({
          extraActions: expect.objectContaining({
            createSnapshot: expect.any(Function),
            initialSnapshot: expect.objectContaining({
              fingerprint: expect.stringMatching(/^extra-actions-snapshot:v1:/),
            }),
          }),
        }),
      );
      const snapshot = await executionOptions.extraActions.createSnapshot();
      expect(snapshot.actionSpace).toEqual([
        expect.objectContaining({
          name: 'MidsceneExtraAction_1',
          description: expect.stringContaining('Click the confirm button'),
        }),
      ]);
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
      agent.aiAct('Fill the form', {
        loadExtraActions: ['/path/that/does/not/need/to/exist.yaml'],
      }),
    ).rejects.toThrow(
      'The "loadExtraActions" option is not supported by custom planning adapters (modelFamily: custom-test)',
    );
    expect(action).not.toHaveBeenCalled();
  });
});
