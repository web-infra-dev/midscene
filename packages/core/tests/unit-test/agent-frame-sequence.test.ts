import { Agent } from '@/agent';
import { ScreenshotItem } from '@/screenshot-item';
import type { UIContext } from '@/types';
import { describe, expect, it, vi } from 'vitest';

const defaultModel = { config: { slot: 'default' } };

const fakeContext = (tag: string): UIContext =>
  ({
    screenshot: ScreenshotItem.create(
      `data:image/png;base64,iVBORw0KGgo-${tag}`,
      Date.now(),
    ),
    shotSize: { width: 100, height: 100 },
    shrunkShotToLogicalRatio: 1,
  }) as UIContext;

const createAgentStub = () => {
  const agent = Object.create(Agent.prototype) as Agent<any>;
  const createTypeQueryExecution = vi.fn(async () => ({
    output: true,
    thought: 'ok',
  }));
  (agent as any).opts = {};
  (agent as any).taskExecutor = { createTypeQueryExecution };
  (agent as any).resolveModelRuntime = vi.fn(() => defaultModel);

  let counter = 0;
  const getUIContext = vi.fn(async () => fakeContext(`frame-${counter++}`));
  (agent as any).getUIContext = getUIContext;

  return { agent, createTypeQueryExecution, getUIContext };
};

describe('Agent frame sequence switch', () => {
  it('is off by default: no extra captures, no screenshotSequence', async () => {
    const { agent, createTypeQueryExecution, getUIContext } = createAgentStub();

    await agent.aiAssert('a toast appeared', undefined, {
      keepRawResponse: true,
    });

    expect(getUIContext).not.toHaveBeenCalled();
    const executionOptions = (
      createTypeQueryExecution.mock.calls[0] as any[]
    )[5];
    expect(executionOptions).toEqual({ abortSignal: undefined });
    expect(executionOptions.uiContext).toBeUndefined();
  });

  it('captures a frame sequence when enabled and passes it as uiContext', async () => {
    const { agent, createTypeQueryExecution, getUIContext } = createAgentStub();

    await agent.aiAssert('a toast appeared', undefined, {
      keepRawResponse: true,
      frameSequence: { count: 3, intervalMs: 0 },
    });

    expect(getUIContext).toHaveBeenCalledTimes(3);
    const executionOptions = (
      createTypeQueryExecution.mock.calls[0] as any[]
    )[5];
    expect(executionOptions.uiContext).toBeDefined();
    expect(executionOptions.uiContext.screenshotSequence).toHaveLength(3);
  });

  it('clamps frame count into the supported range', async () => {
    const { agent, getUIContext } = createAgentStub();

    await agent.aiAssert('a toast appeared', undefined, {
      keepRawResponse: true,
      frameSequence: { count: 99, intervalMs: 0 },
    });

    // max count is 8
    expect(getUIContext).toHaveBeenCalledTimes(8);
  });

  it('skips capture when screenshots are disabled', async () => {
    const { agent, getUIContext } = createAgentStub();

    await agent.aiQuery('whatever', {
      screenshotIncluded: false,
      frameSequence: true,
    });

    expect(getUIContext).not.toHaveBeenCalled();
  });
});
