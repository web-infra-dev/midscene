import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

it.each([1, 3])(
  'retains all %s borrowed frames including the representative',
  (count) => {
    const directory = mkdtempSync(join(tmpdir(), 'recorded-frames-'));
    try {
      const path = join(directory, 'frame.png');
      const bytes = Buffer.from('frame bytes');
      writeFileSync(path, bytes);
      const frames = Array.from({ length: count }, (_, i) =>
        ScreenshotItem.fromFile(path, 'image/png', i),
      );
      const ids = frames.map((frame) => frame.id);
      const context = {
        ...makeUiContext(count),
        screenshotSequence: frames,
        screenshot: frames[count - 1],
      };
      recordAndReleaseScreenshotSequence(makeTask(), context);
      rmSync(directory, { recursive: true, force: true });
      expect(frames.map((frame) => frame.id)).toEqual(ids);
      expect(context.screenshot).toBe(frames[count - 1]);
      for (const frame of frames)
        expect(Buffer.from(frame.rawBase64, 'base64')).toEqual(bytes);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);

it('keeps already persisted observation images lazy', () => {
  const frame = ScreenshotItem.fromFile(
    '/unused-temporary-file.png',
    'image/png',
    1,
  );
  frame.markPersistedToPath('./screenshots/frame.png', '/report/frame.png');
  const context = {
    ...makeUiContext(1),
    screenshotSequence: [frame],
    screenshot: frame,
  };
  // Neither path exists: retention must not read a report-owned image.
  expect(() =>
    recordAndReleaseScreenshotSequence(makeTask(), context),
  ).not.toThrow();
  expect(frame.hasBase64()).toBe(false);
  expect(frame.toSerializable()).toMatchObject({
    storage: 'file',
    path: './screenshots/frame.png',
  });
});
