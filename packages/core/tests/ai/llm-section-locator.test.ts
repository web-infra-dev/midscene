import { getModelRuntime } from '@/ai-model/models';
import { AiLocateSection } from '@/ai-model/workflows/inspect';
import { getTmpFile } from '@/utils';
import { globalModelConfigManager } from '@midscene/shared/env';
import { saveBase64Image } from '@midscene/shared/img';
import { expect, test } from 'vitest';
import { getContextFromFixture } from '../evaluation';

const modelConfig = globalModelConfigManager.getModelConfig('default');
const modelRuntime = getModelRuntime(modelConfig);

test.skipIf(!modelConfig.modelFamily)(
  'locate section',
  {
    timeout: 120 * 1000,
  },
  async () => {
    const { context } = await getContextFromFixture('antd-tooltip');
    const { searchAreaConfig } = await AiLocateSection({
      context,
      sectionDescription: 'the version info on the top right corner',
      modelRuntime,
    });
    expect(searchAreaConfig?.sourceRect).toBeDefined();
    expect(searchAreaConfig?.image.imageBase64).toBeDefined();

    const tmpFile = getTmpFile('jpg');
    await saveBase64Image({
      base64Data: searchAreaConfig!.image.imageBase64,
      outputPath: tmpFile!,
    });
  },
);
