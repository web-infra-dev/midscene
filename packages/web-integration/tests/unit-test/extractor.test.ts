import path, { join } from 'node:path';
import { parseContextFromWebPage } from '@/common/utils';
import { generateTestData } from 'tests/ai/e2e/tool';
import { describe, expect, it } from 'vitest';
import { launchPage } from '../ai/puppeteer/utils';

const pagePath = join(__dirname, './fixtures/extractor.html');

describe(
  'extractor',
  () => {
    it('basic', async () => {
      const page = await launchPage(`file://${pagePath}`);

      const { content, screenshotBase64 } = await parseContextFromWebPage(page);
      await generateTestData(
        page,
        path.join(__dirname, 'extractor'),
        screenshotBase64,
        {
          disableInputImage: true,
          disableOutputImage: false,
          disableOutputWithoutTextImg: true,
          disableResizeOutputImg: true,
          disableSnapshot: true,
        },
      );

      const list = content.map((item) => {
        return {
          content: item.content,
          attributes: item.attributes,
        };
      });
      expect(list).toMatchSnapshot();
    });
  },
  {
    timeout: 90 * 1000,
  },
);
