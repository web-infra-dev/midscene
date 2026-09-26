import { recordAndReleaseScreenshotSequence } from '@/agent/tasks';
import { ScreenshotItem } from '@/screenshot-item';
import type { ExecutionTask, UIContext } from '@/types';
import { describe, expect, it } from '@rstest/core';

const makeUiContext = (frameCount: number): UIContext => {
  const frames = Array.from({ length: frameCount }, (_, i) =>
    ScreenshotItem.create(`data:image/png;base64,iVBORw0KGgo-${i}`, 1000 + i),
  );
  return {
    screenshot: frames[frameCount - 1],
    screenshotSequence: frames,
    shotSize: { width: 100, height: 100 },
    shrunkShotToLogicalRatio: 1,
  } as UIContext;
};

const makeTask = (recorder?: ExecutionTask['recorder']): ExecutionTask =>
  ({ recorder }) as ExecutionTask;

describe('recordAndReleaseScreenshotSequence', () => {
  it('records the earlier frames and releases the sequence from the uiContext', () => {
    const task = makeTask();
    const uiContext = makeUiContext(4);
    const representative = uiContext.screenshot;

    recordAndReleaseScreenshotSequence(task, uiContext);

    // 4 frames -> 3 recorder items (the last is the representative screenshot)
    expect(task.recorder).toHaveLength(3);
    task.recorder?.forEach((item, i) => {
      expect(item.type).toBe('screenshot');
      expect(item.timing).toBe('observed-frame');
      expect(item.description).toBe(`Observed frame ${i + 1}/4`);
      expect(item.ts).toBe(1000 + i);
    });

    // the representative (last) frame must not be duplicated into the recorder
    expect(
      task.recorder?.some((item) => item.screenshot === representative),
    ).toBe(false);

    // the transient sequence is released so its base64 is not retained twice
    expect(uiContext.screenshotSequence).toBeUndefined();
  });

  it('prepends observed frames to an existing recorder without dropping prior items', () => {
    const existing = {
      type: 'screenshot' as const,
      ts: 5,
      screenshot: ScreenshotItem.create(
        'data:image/png;base64,iVBORw0KGgo-x',
        5,
      ),
      timing: 'after-calling',
    };
    const task = makeTask([existing]);

    recordAndReleaseScreenshotSequence(task, makeUiContext(3));

    // Observed frames (2) are prepended, existing stays at the end
    expect(task.recorder).toHaveLength(2 + 1);
    expect(task.recorder?.[0]?.timing).toBe('observed-frame');
    expect(task.recorder?.[1]?.timing).toBe('observed-frame');
    expect(task.recorder?.[2]).toBe(existing);
  });

  it('records focused change frames when an insight generated them', () => {
    const uiContext = makeUiContext(9);
    uiContext.screenshotSequenceFocus = [
      ScreenshotItem.create('data:image/png;base64,focus-1', 1000),
      ScreenshotItem.create('data:image/png;base64,focus-2', 1001),
      ScreenshotItem.create('data:image/png;base64,focus-3', 1002),
    ];
    uiContext.screenshotSequenceFocusFrameIndices = [0, 4, 8];
    const task = makeTask();

    recordAndReleaseScreenshotSequence(task, uiContext);

    expect(task.recorder).toHaveLength(4);
    expect(task.recorder?.map((item) => item.description)).toEqual([
      'Observed full-screen baseline — source frame 1/9',
      'Observed candidate change regions — source frame 1/9',
      'Observed candidate change regions — source frame 5/9',
      'Observed candidate change regions — source frame 9/9',
    ]);
    expect(uiContext.screenshotSequence).toBeUndefined();
    expect(uiContext.screenshotSequenceFocus).toBeUndefined();
    expect(uiContext.screenshotSequenceFocusFrameIndices).toBeUndefined();
  });

  it('is a no-op when there is no screenshot sequence', () => {
    const task = makeTask();
    const uiContext = {
      screenshot: ScreenshotItem.create('data:image/png;base64,iVBORw0KGgo', 1),
      shotSize: { width: 10, height: 10 },
      shrunkShotToLogicalRatio: 1,
    } as UIContext;

    recordAndReleaseScreenshotSequence(task, uiContext);

    expect(task.recorder).toBeUndefined();
  });
});
