import { recordAndReleaseScreenshotSequence } from '@/agent/tasks';
import { ScreenshotItem } from '@/screenshot-item';
import type {
  ExecutionTask,
  ScreenshotSequenceEvidence,
  UIContext,
} from '@/types';
import { describe, expect, it } from '@rstest/core';

function context(): UIContext {
  const frames = Array.from({ length: 12 }, (_, index) =>
    ScreenshotItem.create(`data:image/png;base64,frame-${index}`, index),
  );
  return {
    screenshot: frames[11],
    screenshotSequence: frames,
    shotSize: { width: 100, height: 100 },
    shrunkShotToLogicalRatio: 1,
  };
}

describe('recordAndReleaseScreenshotSequence', () => {
  it('records exactly the model evidence with explicit roles and source indices', () => {
    const uiContext = context();
    const evidence: ScreenshotSequenceEvidence = {
      frames: [
        {
          screenshot: uiContext.screenshotSequence![0],
          sourceFrameIndex: 0,
          role: 'baseline',
        },
        {
          screenshot: ScreenshotItem.create('data:image/png;base64,crop', 6),
          sourceFrameIndex: 6,
          role: 'change-regions',
        },
        {
          screenshot: uiContext.screenshot,
          sourceFrameIndex: 11,
          role: 'final',
        },
      ],
    };
    const task = {} as ExecutionTask;
    recordAndReleaseScreenshotSequence(task, uiContext, evidence);
    expect(task.recorder?.map(({ screenshot }) => screenshot)).toEqual(
      evidence.frames.map(({ screenshot }) => screenshot),
    );
    expect(task.recorder?.map(({ description }) => description)).toEqual([
      'Observed baseline — source frame 1/12; device time unavailable',
      'Observed change-regions — source frame 7/12; device time unavailable',
      'Observed final — source frame 12/12; device time unavailable',
    ]);
    expect(uiContext.screenshotSequence).toBeUndefined();
    expect(uiContext).not.toHaveProperty('screenshotSequenceEvidence');
  });

  it('prepends bounded fallback evidence without adding unsubmitted source frames', () => {
    const uiContext = context();
    const existing = {
      type: 'screenshot' as const,
      screenshot: uiContext.screenshot,
      ts: 20,
      timing: 'after-calling',
    };
    const task = { recorder: [existing] } as ExecutionTask;
    const evidence: ScreenshotSequenceEvidence = {
      frames: [
        {
          screenshot: uiContext.screenshotSequence![0],
          sourceFrameIndex: 0,
          role: 'baseline',
        },
        {
          screenshot: uiContext.screenshot,
          sourceFrameIndex: 11,
          role: 'final',
        },
      ],
    };
    recordAndReleaseScreenshotSequence(task, uiContext, evidence);
    expect(task.recorder).toHaveLength(3);
    expect(task.recorder?.[2]).toBe(existing);
  });

  it('releases the sequence without inventing evidence when no model input was built', () => {
    const uiContext = context();
    const task = {} as ExecutionTask;
    recordAndReleaseScreenshotSequence(task, uiContext);
    expect(task.recorder ?? []).toHaveLength(0);
    expect(uiContext.screenshotSequence).toBeUndefined();
  });
});
