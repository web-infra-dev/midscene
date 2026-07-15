import { verifyCacheActionEffect } from '@/agent/cache-action-verifier';
import { getModelRuntime } from '@/ai-model/models';
import { ScreenshotItem } from '@/screenshot-item';
import Service from '@/service';
import type { UIContext } from '@/types';
import { globalModelConfigManager } from '@midscene/shared/env';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

const modelConfig = globalModelConfigManager.getModelConfig('insight');
const modelRuntime = getModelRuntime(modelConfig);

async function renderInputState(focused: boolean, capturedAt: number) {
  const border = focused ? '#2563eb' : '#aab2bd';
  const focusRing = focused
    ? '<rect x="174" y="194" width="552" height="102" rx="10" fill="none" stroke="#bfdbfe" stroke-width="8" />'
    : '';
  const caret = focused
    ? '<line x1="226" y1="224" x2="226" y2="270" stroke="#2563eb" stroke-width="4" />'
    : '';
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="900" height="500">
      <rect width="900" height="500" fill="#f7f8fa" />
      <text x="180" y="120" font-family="Arial, sans-serif" font-size="38" fill="#111827">Product search</text>
      <text x="180" y="172" font-family="Arial, sans-serif" font-size="22" fill="#4b5563">Search</text>
      ${focusRing}
      <rect x="180" y="200" width="540" height="90" rx="6" fill="#ffffff" stroke="${border}" stroke-width="4" />
      <text x="226" y="258" font-family="Arial, sans-serif" font-size="28" fill="#9ca3af">Type a product name</text>
      ${caret}
    </svg>
  `;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return ScreenshotItem.create(
    `data:image/png;base64,${png.toString('base64')}`,
    capturedAt,
  );
}

describe.skipIf(!modelConfig.modelFamily)(
  'cached action AI verification',
  () => {
    it(
      'recognizes that tapping an input visibly activated it',
      { timeout: 120_000 },
      async () => {
        const beforeScreenshot = await renderInputState(false, 1);
        const afterScreenshot = await renderInputState(true, 2);
        const afterContext = {
          screenshot: afterScreenshot,
          shotSize: { width: 900, height: 500 },
          shrunkShotToLogicalRatio: 1,
        } as UIContext;
        const service = new Service(afterContext);

        const { result } = await verifyCacheActionEffect(
          service,
          modelRuntime,
          {
            actionName: 'Tap',
            targetDescription: 'Search input field',
            beforeScreenshot,
            afterContext,
          },
        );

        expect(result.status).toBe('passed');
        expect(result.reason.length).toBeGreaterThan(0);
      },
    );
  },
);
