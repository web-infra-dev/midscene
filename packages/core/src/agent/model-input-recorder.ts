import { Buffer } from 'node:buffer';
import type { ModelRuntime } from '@/ai-model/models';
import { ScreenshotItem } from '@/screenshot-item';
import type { ExecutionTask } from '@/types';
import { parseBase64 } from '@midscene/shared/img';
import { sha256Hex } from '@midscene/shared/utils';

const MODEL_INPUT_TIMING = 'model-input';

function screenshotContentHash(imageBase64: string): string {
  const { body } = parseBase64(imageBase64);
  return sha256Hex(Buffer.from(body, 'base64'));
}

/**
 * Bind a model runtime to one report task so the report retains the exact
 * data-URI bytes passed to the provider after padding/cropping/resizing.
 */
export function recordModelInputsForTask(
  modelRuntime: ModelRuntime,
  task: ExecutionTask,
  sourceScreenshot?: ScreenshotItem,
): ModelRuntime {
  return {
    ...modelRuntime,
    onModelInputImages: (images) => {
      modelRuntime.onModelInputImages?.(images);

      for (const [index, imageBase64] of images.entries()) {
        if (!imageBase64.startsWith('data:image/')) {
          continue;
        }

        const contentHash = screenshotContentHash(imageBase64);
        const alreadyRecorded = task.recorder?.some(
          (item) =>
            item.timing === MODEL_INPUT_TIMING &&
            item.screenshot &&
            screenshotContentHash(item.screenshot.base64) === contentHash,
        );
        if (alreadyRecorded) {
          continue;
        }

        const uiScreenshot = task.uiContext?.screenshot ?? sourceScreenshot;
        const screenshot =
          uiScreenshot &&
          screenshotContentHash(uiScreenshot.base64) === contentHash
            ? uiScreenshot
            : ScreenshotItem.create(imageBase64, Date.now());
        const recorderItem = {
          type: 'screenshot' as const,
          ts: Date.now(),
          screenshot,
          timing: MODEL_INPUT_TIMING,
          description: `Model input ${index + 1} (exact bytes, sha256: ${contentHash})`,
        };
        task.recorder = [...(task.recorder ?? []), recorderItem];
      }
    },
  };
}
