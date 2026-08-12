import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Agent } from '@/agent';
import {
  applyElementXpathsToPlans,
  elementXpathsPlanningContext,
  loadElementXpaths,
} from '@/agent/element-xpaths';
import { TaskExecutor } from '@/agent/tasks';
import { getMidsceneLocationSchema } from '@/ai-model';
import { getModelRuntime } from '@/ai-model/models';
import { genericXmlPlan } from '@/ai-model/workflows/planning';
import type { AbstractInterface } from '@/device';
import { ScreenshotItem } from '@/screenshot-item';
import type { DeviceAction } from '@/types';
import yaml from 'js-yaml';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('element XPath maps', () => {
  const tempDirs: string[] = [];

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(async () => {
    await Promise.all(
      tempDirs
        .splice(0)
        .map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  async function writeElementXpaths(content: string) {
    const dir = await mkdtemp(join(tmpdir(), 'midscene-element-xpaths-'));
    tempDirs.push(dir);
    const filePath = join(dir, 'element-xpaths.yaml');
    await writeFile(filePath, content);
    return filePath;
  }

  const inputAction = (call = vi.fn()): DeviceAction => ({
    name: 'Input',
    description: 'Input text into an element',
    interfaceAlias: 'aiInput',
    paramSchema: z.object({
      value: z.string(),
      locate: getMidsceneLocationSchema(),
    }),
    call,
    delayBeforeRunner: 0,
    delayAfterRunner: 0,
  });

  it('loads multiple element-to-XPath entries from one YAML file', async () => {
    const filePath = await writeElementXpaths(`
elements:
  First name input: //*[@id="first-name"]
  Notes input: //*[@id="notes"]
`);

    const loaded = await loadElementXpaths([filePath]);

    expect(loaded).toEqual([
      { name: 'First name input', xpath: '//*[@id="first-name"]' },
      { name: 'Notes input', xpath: '//*[@id="notes"]' },
    ]);
    expect(elementXpathsPlanningContext(loaded)).toContain(
      '"First name input":"//*[@id=\\"first-name\\"]"',
    );
  });

  it('injects a matching XPath without overriding an existing locator', () => {
    const action = inputAction();
    const mapped = applyElementXpathsToPlans(
      [
        {
          type: 'Input',
          param: {
            value: 'Alice',
            locate: { prompt: 'the "first NAME input"' },
          },
        },
        {
          type: 'Input',
          param: {
            value: 'Bob',
            locate: {
              prompt: 'First name input',
              xpath: '//*[@id="already-known"]',
            },
          },
        },
        {
          type: 'Input',
          param: {
            value: 'Charlie',
            locate: { prompt: 'Unmapped input' },
          },
        },
        {
          type: 'Input',
          param: {
            value: 'Dora',
            locate: {
              prompt: 'First name input',
              bbox: [100, 200, 300, 400],
              locatedPixelBbox: [10, 20, 30, 40],
            },
          },
        },
        {
          type: 'Input',
          param: {
            value: 'Eve',
            locate: {
              description: 'First name input',
              rect: { left: 10, top: 20, width: 30, height: 40 },
              center: [25, 40],
            },
          },
        },
      ],
      [{ name: 'First name input', xpath: '//*[@id="first-name"]' }],
      [action],
    );

    expect(mapped.mapped).toBe(true);
    expect(mapped.plans).toEqual([
      {
        type: 'Input',
        param: {
          value: 'Alice',
          locate: {
            prompt: 'the "first NAME input"',
            xpath: '//*[@id="first-name"]',
          },
        },
      },
      {
        type: 'Input',
        param: {
          value: 'Bob',
          locate: {
            prompt: 'First name input',
            xpath: '//*[@id="already-known"]',
          },
        },
      },
      {
        type: 'Input',
        param: {
          value: 'Charlie',
          locate: { prompt: 'Unmapped input' },
        },
      },
      {
        type: 'Input',
        param: {
          value: 'Dora',
          locate: {
            prompt: 'First name input',
            xpath: '//*[@id="first-name"]',
          },
        },
      },
      {
        type: 'Input',
        param: {
          value: 'Eve',
          locate: {
            prompt: 'First name input',
            xpath: '//*[@id="first-name"]',
          },
        },
      },
    ]);
  });

  it('rejects invalid and conflicting map entries before planning', async () => {
    const invalidPath = await writeElementXpaths(`
elements:
  First name input: false
`);
    const duplicatePath = await writeElementXpaths(`
elements:
  first NAME input: //*[@id="other-first-name"]
`);

    await expect(loadElementXpaths([invalidPath])).rejects.toThrow(
      'XPath for element "First name input" must be a non-empty string',
    );
    await expect(
      loadElementXpaths([
        await writeElementXpaths(`
elements:
  First name input: //*[@id="first-name"]
`),
        duplicatePath,
      ]),
    ).rejects.toThrow(
      'element name "first NAME input" conflicts with "First name input"',
    );
  });

  it('passes the map to planning and disables planner coordinate grounding', async () => {
    const filePath = await writeElementXpaths(`
elements:
  First name input: //*[@id="first-name"]
`);
    const action = vi.fn().mockResolvedValue({
      output: { output: 'done', yamlFlow: [] },
    });
    const matchPlanCache = vi.fn();
    const agent = Object.create(Agent.prototype) as Agent<any>;
    (agent as any).opts = { aiActContext: 'Existing request context' };
    (agent as any).interface = { interfaceType: 'web' };
    (agent as any).fullActionSpace = [inputAction()];
    (agent as any).taskExecutor = { action };
    (agent as any).taskCache = {
      matchPlanCache,
      isCacheResultUsed: true,
      updateOrAppendCacheRecord: vi.fn(),
    };
    (agent as any).resolveModelRuntime = vi.fn(() => modelRuntime());
    (agent as any).resolveReplanningCycleLimit = vi.fn(() => 1);

    await expect(
      agent.aiAct('Fill the profile form', {
        loadElementXpaths: [filePath],
      }),
    ).resolves.toBe('done');

    expect(action.mock.calls[0][3]).toBe(false);
    expect(action.mock.calls[0][4]).toMatchObject({
      aiActContext: expect.stringContaining('Existing request context'),
      elementXpaths: [
        { name: 'First name input', xpath: '//*[@id="first-name"]' },
      ],
    });
    expect(action.mock.calls[0][4].aiActContext).toContain(
      'use the map key verbatim as the locator prompt',
    );
    expect(matchPlanCache.mock.calls[0][0]).toContain(
      '"First name input":"//*[@id=\\"first-name\\"]"',
    );
  });

  it('uses XPath resolution and makes no AI locate call for a mapped element', async () => {
    const inputCall = vi.fn();
    const locate = vi.fn();
    const action = inputAction(inputCall);
    const mockInterface = {
      interfaceType: 'web',
      actionSpace: () => [action],
      rectMatchesCacheFeature: vi.fn().mockResolvedValue({
        left: 0,
        top: 0,
        width: 1,
        height: 1,
      }),
      cacheFeatureForPoint: vi.fn().mockResolvedValue(undefined),
    } as unknown as AbstractInterface;
    const mockService = {
      contextRetrieverFn: vi.fn().mockResolvedValue({
        screenshot: ScreenshotItem.create(validBase64Image, Date.now()),
        shotSize: { width: 1, height: 1 },
        shrunkShotToLogicalRatio: 1,
        tree: { id: 'root', attributes: {}, children: [] },
      }),
      locate,
    } as unknown as Service;
    const taskExecutor = new TaskExecutor(mockInterface, mockService, {
      replanningCycleLimit: 1,
      actionSpace: [action],
    });
    vi.mocked(genericXmlPlan).mockResolvedValue({
      actions: [
        {
          type: 'Input',
          param: {
            value: 'Alice',
            locate: {
              prompt: 'First name input',
              locatedPixelBbox: [20, 20, 40, 40],
            },
          },
          thought: 'fill the first name',
        },
      ],
      yamlFlow: [],
      shouldContinuePlanning: false,
    } as any);

    const result = await taskExecutor.action(
      'Fill the profile form',
      modelRuntime(),
      modelRuntime(),
      false,
      {
        elementXpaths: [
          { name: 'First name input', xpath: '//*[@id="first-name"]' },
        ],
      },
    );

    expect(locate).not.toHaveBeenCalled();
    expect(mockInterface.rectMatchesCacheFeature).toHaveBeenCalledWith({
      xpaths: ['//*[@id="first-name"]'],
    });
    expect(inputCall).toHaveBeenCalledOnce();
    expect(result.output?.yamlFlow).toEqual([
      {
        aiInput: '',
        value: 'Alice',
        locate: {
          prompt: 'First name input',
          xpath: '//*[@id="first-name"]',
        },
      },
    ]);
    expect(
      result.runner.tasks.find((task) => task.subType === 'Locate')?.hitBy,
    ).toEqual({
      from: 'User expected path',
      context: { xpath: '//*[@id="first-name"]' },
    });

    const replayAction = vi.fn();
    await Agent.prototype.runYaml.call(
      {
        callActionInActionSpace: replayAction,
        getActionSpace: vi.fn().mockResolvedValue([action]),
        onTaskStartTip: undefined,
      } as any,
      yaml.dump({
        tasks: [
          {
            name: 'cached mapped action',
            flow: result.output?.yamlFlow,
          },
        ],
      }),
    );
    expect(replayAction).toHaveBeenCalledWith(
      'Input',
      expect.objectContaining({
        value: 'Alice',
        locate: expect.objectContaining({
          prompt: 'First name input',
          xpath: '//*[@id="first-name"]',
        }),
      }),
    );
  });
});
