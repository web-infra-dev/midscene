import { AiLocateSection } from '@/ai-model/inspect';
import { getTmpFile } from '@/utils';
import { globalModelConfigManager } from '@midscene/shared/env';
import { saveBase64Image } from '@midscene/shared/img';
import { getContextFromFixture } from 'tests/evaluation';
import { expect, test } from 'vitest';

const modelConfig = globalModelConfigManager.getModelConfig('default');

test.skipIf(!modelConfig.modelFamily)(
  'locate section',
  {
    timeout: 60 * 1000,
  },
  async () => {
    const { context } = await getContextFromFixture('antd-tooltip');
    const { rect, imageBase64 } = await AiLocateSection({
      context,
      sectionDescription: 'the version info on the top right corner',
      modelConfig,
    });
    expect(rect).toBeDefined();
    expect(imageBase64).toBeDefined();

    const tmpFile = getTmpFile('jpg');
    await saveBase64Image({
      base64Data: imageBase64!,
      outputPath: tmpFile!,
    });
  },
);
