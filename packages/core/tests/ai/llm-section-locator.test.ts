import { AiLocateElement } from '@/ai-model';
import { AiLocateSection } from '@/ai-model/inspect';
import { saveBase64Image } from '@/image';
import { getTmpFile } from '@/utils';
import { getContextFromFixture } from 'tests/evaluation';
import { expect, test } from 'vitest';

test(
  'locate section',
  async () => {
    const { context } = await getContextFromFixture('antd-tooltip');
    const { rect, imageBase64 } = await AiLocateSection({
      context,
      sectionDescription: 'the version info on the top right corner',
    });
    expect(rect).toBeDefined();
    expect(imageBase64).toBeDefined();

    const tmpFile = getTmpFile('jpg');
    await saveBase64Image({
      base64Data: imageBase64!,
      outputPath: tmpFile!,
    });
    console.log('tmpFile', tmpFile);
  },
  {
    timeout: 60 * 1000,
  },
);
