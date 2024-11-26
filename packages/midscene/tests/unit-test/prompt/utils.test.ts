import { describeUserPage } from '@/ai-model/prompt/util';
import { describe, expect, it } from 'vitest';
import { getPageDataOfTestName } from '../../ai/evaluate/test-suite/util';

describe('prompt utils', () => {
  let lengthOfDescription: number;
  it('describe context', async () => {
    const context = await getPageDataOfTestName('taobao');
    const { description } = await describeUserPage(context.context);

    lengthOfDescription = description.length;
    const stringLengthOfEachItem =
      lengthOfDescription / context.context.content.length;
    expect(description).toBeTruthy();
    expect(stringLengthOfEachItem).toBeLessThan(160);
  });

  it('describe context, length = 100, filterEmptyContent = true', async () => {
    const context = await getPageDataOfTestName('taobao');

    const { description } = await describeUserPage(context.context, {
      truncateTextLength: 100,
      filterEmptyContent: true,
    });

    const stringLengthOfEachItem =
      description.length / context.context.content.length;
    expect(description).toBeTruthy();
    expect(stringLengthOfEachItem).toBeLessThan(160);

    expect(description.length).toBeLessThan(lengthOfDescription * 0.8);
  });
});
