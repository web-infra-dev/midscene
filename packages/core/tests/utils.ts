import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { callAIWithObjectResponse } from '@/ai-model/service-caller/index';
import { localImg2Base64 } from '@/image';
import Insight from '@/insight';
import type { AIElementLocatorResponse, BaseElement, UIContext } from '@/types';
import { NodeType } from '@midscene/shared/constants';
import { vi } from 'vitest';

export function getFixture(name: string) {
  return join(__dirname, 'fixtures', name);
}

export function getDemoFilePath(name: string) {
  return join(__dirname, `../demo_data/${name}`);
}

export function updateAppDemoData(fileName: string, data: object) {
  const demoPath = getDemoFilePath(fileName);
  writeFileSync(demoPath, JSON.stringify(data, null, 2));
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function fakeInsight(content: string) {
  const screenshot = getFixture('baidu.png');
  const screenshotBase64 = localImg2Base64(screenshot);
  const basicContext = {
    screenshotBase64,
    screenshotBase64List: [screenshotBase64],
    size: { width: 1920, height: 1080 },
    content: [
      {
        id: '0',
        content,
        rect: {
          width: 100,
          height: 100,
          top: 200,
          left: 200,
        },
        center: [250, 250],
        tap: vi.fn() as unknown,
        isVisible: true,
      },
    ] as unknown as BaseElement[],
    tree: {
      node: {
        id: '0',
        attributes: {
          nodeType: NodeType.CONTAINER,
        },
        content: '',
        rect: {
          width: 100,
          height: 100,
          top: 200,
          left: 200,
        },
        center: [250, 250] as [number, number],
        children: [],
        isVisible: true,
      },
      children: [],
    },
  };
  const context: UIContext = {
    ...basicContext,
  };

  const aiVendor: typeof callAIWithObjectResponse<AIElementLocatorResponse> =
    async () => ({
      content: {
        elements: [{ id: '0', reason: '', text: '' }],
        errors: [],
      },
      usage: undefined,
    });

  const insight = new Insight(context, {
    aiVendorFn: aiVendor as any,
  });

  return insight;
}
