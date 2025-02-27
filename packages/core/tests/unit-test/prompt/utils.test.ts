import { describeUserPage } from '@/ai-model/prompt/util';
import { getAIConfigInBoolean } from '@/env';
import { getContextFromFixture } from '@/evaluation';
import { describe, expect, it } from 'vitest';

describe('prompt utils', () => {
  let lengthOfDescription: number;
  it('describe context', async () => {
    const context = await getContextFromFixture('taobao');
    const { description } = await describeUserPage(context.context);

    lengthOfDescription = description.length;
    const stringLengthOfEachItem =
      lengthOfDescription / context.context.content.length;
    expect(description).toBeTruthy();
    expect(stringLengthOfEachItem).toBeLessThan(250);
  });

  it('describe context, length = 100, filterNonTextContent = true', async () => {
    const context = await getContextFromFixture('taobao');

    const { description } = await describeUserPage(context.context, {
      truncateTextLength: 100,
      filterNonTextContent: true,
    });

    const stringLengthOfEachItem =
      description.length / context.context.content.length;
    expect(description).toBeTruthy();
    expect(stringLengthOfEachItem).toBeLessThan(160);

    if (!getAIConfigInBoolean('MATCH_BY_POSITION')) {
      expect(description.length).toBeLessThan(lengthOfDescription * 0.8);
    }
  });
});
