import { describeUserPage } from '@/ai-model/prompt/util';
import { describe, expect, it } from 'vitest';
import { getPageDataOfTestName } from '../../ai/evaluate/test-suite/util';

describe('prompt utils', () => {
  it('describe context', async () => {
    const context = await getPageDataOfTestName('taobao');

    const { description } = await describeUserPage(context.context);
    console.log(description);

    const stringLengthOfEachItem =
      description.length / context.context.content.length;
    expect(description).toBeTruthy();
    expect(stringLengthOfEachItem).toBeLessThan(160);
  });
});
