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
    screenshotBase64: async () =>
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=',
  } as any;
}

describe('Agent describeElementAtPoint', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('skips locator verification when verifyPrompt is false', async () => {
    const agent = new Agent(createMockInterface(), {
      generateReport: false,
      modelConfig,
    });
    vi.spyOn(agent.service, 'describe').mockResolvedValue({
      description: 'LocalSearch title',
    });
    const verifyLocator = vi
      .spyOn(agent, 'verifyLocator')
      .mockRejectedValue(new Error('should not verify locator'));

    const result = await agent.describeElementAtPoint([10, 20], {
      verifyPrompt: false,
    });

    expect(result).toEqual({
      prompt: 'LocalSearch title',
      deepLocate: false,
      verifyResult: undefined,
    });
    expect(verifyLocator).not.toHaveBeenCalled();

    await agent.destroy();
  });

  it('keeps locator verification enabled by default', async () => {
    const agent = new Agent(createMockInterface(), {
      generateReport: false,
      modelConfig,
    });
    vi.spyOn(agent.service, 'describe').mockResolvedValue({
      description: 'LocalSearch title',
    });
    const verifyResult = {
      pass: true,
      rect: { left: 0, top: 0, width: 20, height: 20 },
      center: [10, 10] as [number, number],
      centerDistance: 10,
    };
    const verifyLocator = vi
      .spyOn(agent, 'verifyLocator')
      .mockResolvedValue(verifyResult);

    const result = await agent.describeElementAtPoint([10, 20]);

    expect(result.verifyResult).toBe(verifyResult);
    expect(verifyLocator).toHaveBeenCalledWith(
      'LocalSearch title',
      undefined,
      [10, 20],
      undefined,
    );

    await agent.destroy();
  });
});
