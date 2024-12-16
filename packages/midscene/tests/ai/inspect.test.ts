import path from 'node:path';
import { AiInspectElement } from '@/ai-model';
import { expect, test } from 'vitest';
import { getPageTestData } from './evaluate/test-suite/util';

test('inspect with quick answer', async () => {
  const { context } = await getPageTestData(
    path.join(__dirname, './evaluate/test-data/todo'),
  );

  const startTime = Date.now();
  const { parseResult } = await AiInspectElement({
    context,
    multi: false,
    targetElementDescription: 'never mind',
    quickAnswer: {
      id: 'cdfaac34adc2088e',
      reason: 'never mind',
      text: 'never mind',
    },
  });
  const endTime = Date.now();
  const cost = endTime - startTime;
  expect(parseResult.elements.length).toBe(1);
  expect(cost).toBeLessThan(100);
});
