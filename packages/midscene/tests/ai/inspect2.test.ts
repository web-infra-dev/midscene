import path from 'node:path';
import { AiInspectElement } from '@/ai-model';
import { expect, test } from 'vitest';
import { getPageTestData } from './evaluate/test-suite/util';

test(
  'inspect with quick answer',
  async () => {
    const { context } = await getPageTestData(
      path.join(__dirname, './evaluate/test-data/todo'),
    );

    const startTime = Date.now();
    const { parseResult } = await AiInspectElement({
      context,
      multi: false,
      targetElementDescription: 'input 输入框',
    });
    console.log('parseResult', JSON.stringify(parseResult, null, 2));
    const endTime = Date.now();
    const cost = endTime - startTime;
    expect(parseResult.elements.length).toBe(1);
  },
  {
    timeout: 1000000,
  },
);
