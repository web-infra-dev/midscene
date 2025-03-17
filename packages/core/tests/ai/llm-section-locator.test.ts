import { AiLocateElement } from '@/ai-model';
import { AiLocateSection } from '@/ai-model/inspect';
import { getContextFromFixture } from 'tests/evaluation';
import { expect, test } from 'vitest';

test(
  'locate section',
  async () => {
    const { context } = await getContextFromFixture('antd-tooltip');
    const { sectionBbox } = await AiLocateSection({
      context,
      sectionDescription: 'the version info on the top right corner',
    });
    expect(sectionBbox.length).toBe(4);
  },
  {
    timeout: 60 * 1000,
  },
);
