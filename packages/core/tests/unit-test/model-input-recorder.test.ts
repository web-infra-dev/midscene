import { recordModelInputsForTask } from '@/agent/model-input-recorder';
import type { ModelRuntime } from '@/ai-model/models';
import { ScreenshotItem } from '@/screenshot-item';
import type { ExecutionTask } from '@/types';
import { describe, expect, it, vi } from 'vitest';

const pngBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA';
const webpBase64 =
  'data:image/webp;base64,UklGRjQAAABXRUJQVlA4ICgAAACQAQCdASoCAAMAAMASJQBOl0AAjNAA/v4icv1difCfoP7mxzi2QwAA';

function createTask(): ExecutionTask {
  const screenshot = ScreenshotItem.create(pngBase64, 100);
  return {
    taskId: 'task-1',
    type: 'Planning',
    subType: 'Plan',
    status: 'running',
    executor: vi.fn(),
    uiContext: {
      screenshot,
      shotSize: { width: 5, height: 1 },
      shrunkShotToLogicalRatio: 1,
    },
  };
}

describe('recordModelInputsForTask', () => {
  it('reuses the report screenshot when the exact bytes are sent to AI', () => {
    const task = createTask();
    const runtime = recordModelInputsForTask({} as ModelRuntime, task);

    runtime.onModelInputImages?.([pngBase64]);

    expect(task.recorder).toHaveLength(1);
    expect(task.recorder?.[0].screenshot).toBe(task.uiContext?.screenshot);
    expect(task.recorder?.[0].timing).toBe('model-input');
    expect(task.recorder?.[0].description).toMatch(
      /^Model input 1 \(exact bytes, sha256: [a-f0-9]{64}\)$/,
    );
  });

  it('records a transformed model image and deduplicates request retries', () => {
    const task = createTask();
    const parentCallback = vi.fn();
    const parentRuntime = {} as ModelRuntime;
    parentRuntime.onModelInputImages = parentCallback;
    const runtime = recordModelInputsForTask(parentRuntime, task);

    runtime.onModelInputImages?.([webpBase64]);
    runtime.onModelInputImages?.([webpBase64]);

    expect(parentCallback).toHaveBeenCalledTimes(2);
    expect(task.recorder).toHaveLength(1);
    expect(task.recorder?.[0].screenshot?.base64).toBe(webpBase64);
    expect(task.recorder?.[0].screenshot).not.toBe(task.uiContext?.screenshot);
  });

  it('reuses the executor context screenshot before it is bound to the task', () => {
    const task = createTask();
    const sourceScreenshot = task.uiContext!.screenshot;
    task.uiContext = undefined;
    const runtime = recordModelInputsForTask(
      {} as ModelRuntime,
      task,
      sourceScreenshot,
    );

    runtime.onModelInputImages?.([pngBase64]);

    expect(task.recorder?.[0].screenshot).toBe(sourceScreenshot);
  });

  it('does not turn remote reference image URLs into screenshot items', () => {
    const task = createTask();
    const runtime = recordModelInputsForTask({} as ModelRuntime, task);

    runtime.onModelInputImages?.(['https://example.com/reference.png']);

    expect(task.recorder).toBeUndefined();
  });
});
