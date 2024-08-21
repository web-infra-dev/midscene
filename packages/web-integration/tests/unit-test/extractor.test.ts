import path, { join } from 'node:path';
import { parseContextFromWebPage } from '@/common/utils';
import { generateTestData } from 'tests/ai/e2e/tool';
import { describe, expect, it } from 'vitest';
import { launchPage } from '../ai/puppeteer/utils';

const pagePath = join(__dirname, './fixtures/extractor/index.html');
describe(
  'extractor',
  () => {
    it('basic', async () => {
      const { page, reset } = await launchPage(`file://${pagePath}`);

      const { content, screenshotBase64 } = await parseContextFromWebPage(page);
      await generateTestData(
        page,
        path.join(__dirname, 'fixtures/extractor'),
        screenshotBase64,
        {
          disableInputImage: false,
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
      await reset();
    });
  },
  {
    timeout: 90 * 1000,
  },
);
