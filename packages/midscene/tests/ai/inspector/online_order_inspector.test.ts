import path from 'node:path';
import { AiInspectElement } from '@/ai-model';
import { expect, test } from 'vitest';
import {
  getPageTestData,
  repeat,
  runTestCases,
  writeFileSyncWithDir,
} from './util';

const testCases = [
  {
    description: 'Top left menu bar icon',
    multi: false,
  },
  {
    description: 'Toggle language text button(Could be：中文、english text)',
    multi: false,
  },
  {
    description: 'Top right shopping cart',
    multi: false,
  },
  {
    description: 'The price number on the right of the drink picture',
    multi: true,
  },
  {
    description: '选择规格按钮',
    multi: true,
  },
  {
    description: 'Bottom right Customer service button',
    multi: false,
  },
];

const repeatTime = process.env.GITHUB_ACTIONS ? 1 : 5;

repeat(repeatTime, (repeatIndex) => {
  test(
    'xicha: inspect element',
    async () => {
      const { context } = await getPageTestData(
        path.join(__dirname, './test-data/online_order'),
      );

      const { aiResponse, filterUnstableResult } = await runTestCases(
        testCases,
        context,
        async (testCase) => {
          const { parseResult } = await AiInspectElement({
            context,
            multi: testCase.multi,
            findElementDescription: testCase.description,
          });
          return parseResult;
        },
      );
      writeFileSyncWithDir(
        path.join(
          __dirname,
          `__ai_responses__/online_order-inspector-element-${repeatIndex}.json`,
        ),
        JSON.stringify(aiResponse, null, 2),
        { encoding: 'utf-8' },
      );
      expect(filterUnstableResult).toMatchFileSnapshot(
        './__snapshots__/online_order_inspector.test.ts.snap',
      );
    },
    {
      timeout: 90 * 1000,
    },
  );
});
