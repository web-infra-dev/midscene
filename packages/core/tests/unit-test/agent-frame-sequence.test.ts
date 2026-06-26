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

const createAgentStub = (
  opts: { captureFrameSequence?: (...args: any[]) => any } = {},
) => {
  const agent = Object.create(Agent.prototype) as Agent<any>;
  const createTypeQueryExecution = vi.fn(async () => ({
    output: true,
    thought: 'ok',
  }));
  (agent as any).opts = {};
  (agent as any).taskExecutor = { createTypeQueryExecution };
  (agent as any).resolveModelRuntime = vi.fn(() => defaultModel);
  // The interface is consulted for an optional fast frame-sequence source.
  (agent as any).interface = opts.captureFrameSequence
    ? { captureFrameSequence: opts.captureFrameSequence }
    : {};

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

  it('does not capture any frame when the signal is already aborted', async () => {
    const { agent, getUIContext } = createAgentStub();
    const controller = new AbortController();
    controller.abort();

    await expect(
      agent.aiAssert('a toast appeared', undefined, {
        keepRawResponse: true,
        abortSignal: controller.signal,
        frameSequence: true,
      }),
    ).rejects.toBeDefined();

    expect(getUIContext).not.toHaveBeenCalled();
  });

  it('stops capturing promptly when aborted mid-sequence', async () => {
    const { agent, getUIContext } = createAgentStub();
    const controller = new AbortController();
    // Abort right after the first frame is captured.
    getUIContext.mockImplementationOnce(async () => {
      controller.abort();
      return fakeContext('frame-0');
    });

    await expect(
      agent.aiAssert('a toast appeared', undefined, {
        keepRawResponse: true,
        abortSignal: controller.signal,
        frameSequence: { count: 6, intervalMs: 50 },
      }),
    ).rejects.toBeDefined();

    // Should bail out long before capturing all 6 frames.
    expect(getUIContext.mock.calls.length).toBeLessThan(6);
  });

  it('uses the device fast frame source when available', async () => {
    const captureFrameSequence = vi.fn(async ({ count }: { count: number }) =>
      Array.from({ length: count }, (_, i) => ({
        base64: `data:image/jpeg;base64,stream-${i}`,
        capturedAt: 1000 + i,
      })),
    );
    const { agent, getUIContext } = createAgentStub({ captureFrameSequence });

    await agent.aiAssert('a toast appeared', undefined, {
      keepRawResponse: true,
      frameSequence: { count: 5, intervalMs: 100 },
    });

    // Earlier frames come from the stream (count - 1)...
    expect(captureFrameSequence).toHaveBeenCalledWith(
      expect.objectContaining({ count: 4, intervalMs: 100 }),
    );
    // ...and exactly one representative is captured via the normal screenshot.
    expect(getUIContext).toHaveBeenCalledTimes(1);
  });

  it('falls back to sequential capture when the fast source fails', async () => {
    const captureFrameSequence = vi.fn(async () => {
      throw new Error('stream unavailable');
    });
    const { agent, getUIContext } = createAgentStub({ captureFrameSequence });

    await agent.aiAssert('a toast appeared', undefined, {
      keepRawResponse: true,
      frameSequence: { count: 4, intervalMs: 0 },
    });

    expect(captureFrameSequence).toHaveBeenCalledTimes(1);
    // Fallback path captures all 4 frames sequentially via screenshots.
    expect(getUIContext).toHaveBeenCalledTimes(4);
  });
});
