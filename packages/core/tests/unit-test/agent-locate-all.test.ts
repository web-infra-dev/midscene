import { Agent } from '@/agent';
import {
  MIDSCENE_MODEL_API_KEY,
  MIDSCENE_MODEL_BASE_URL,
  MIDSCENE_MODEL_NAME,
} from '@midscene/shared/env';
import { afterEach, describe, expect, it, vi } from 'vitest';

const modelConfig = {
  [MIDSCENE_MODEL_NAME]: 'test-model',
  [MIDSCENE_MODEL_API_KEY]: 'test-key',
  [MIDSCENE_MODEL_BASE_URL]: 'https://api.test.com/v1',
};

function createMockInterface() {
  return {
    interfaceType: 'puppeteer',
    actionSpace: () => [],
    describe: () => 'test page',
    size: async () => ({ width: 1280, height: 720 }),
    screenshotBase64: async () => '',
  } as any;
}

describe('Agent.aiLocateAll', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('dispatches a LocateAll plan and returns located points', async () => {
    const agent = new Agent(createMockInterface(), {
      generateReport: false,
      modelConfig,
    });
    const runPlans = vi
      .spyOn(agent.taskExecutor, 'runPlans')
      .mockResolvedValue({
        output: {
          elements: [
            {
              center: [20, 30],
              rect: { left: 10, top: 20, width: 30, height: 40 },
              description: 'target',
              dpr: 2,
            },
          ],
        },
        runner: {} as any,
      });

    const result = await agent.aiLocateAll('all submit buttons');

    expect(runPlans).toHaveBeenCalledWith(
      'LocateAll - all submit buttons',
      [
        {
          type: 'LocateAll',
          param: {
            prompt: 'all submit buttons',
          },
          thought: '',
        },
      ],
      expect.objectContaining({
        config: expect.objectContaining({ intent: 'planning' }),
      }),
      expect.objectContaining({
        config: expect.objectContaining({ intent: 'default' }),
      }),
      undefined,
    );
    expect(result).toEqual([
      {
        center: [20, 30],
        rect: { left: 10, top: 20, width: 30, height: 40 },
        dpr: 2,
      },
    ]);
  });

  it('rejects single-element locate options that are unsupported by aiLocateAll', async () => {
    const agent = new Agent(createMockInterface(), {
      generateReport: false,
      modelConfig,
    });
    const runPlans = vi.spyOn(agent.taskExecutor, 'runPlans');

    await expect(
      agent.aiLocateAll('all submit buttons', { cacheable: false } as any),
    ).rejects.toThrow(
      /aiLocateAll does not support these single-element locate options: cacheable/,
    );
    await expect(
      agent.aiLocateAll('all submit buttons', { deepLocate: true } as any),
    ).rejects.toThrow(
      /aiLocateAll does not support these single-element locate options: deepLocate/,
    );
    await expect(
      agent.aiLocateAll('all submit buttons', {
        xpath: '//*[@id="submit"]',
      } as any),
    ).rejects.toThrow(
      /aiLocateAll does not support these single-element locate options: xpath/,
    );
    expect(runPlans).not.toHaveBeenCalled();
  });
});
