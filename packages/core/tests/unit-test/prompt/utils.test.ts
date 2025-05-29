import { describeUserPage } from '@/ai-model/prompt/util';
import { getContextFromFixture } from 'tests/evaluation';
import { describe, expect, it } from 'vitest';

describe('prompt utils', () => {
  let lengthOfDescription: number;
  it('describe context, length = 50 ', async () => {
    const context = await getContextFromFixture('todo');
    const { description } = await describeUserPage(context.context, {
      truncateTextLength: 50,
      domIncluded: true,
    });

    lengthOfDescription = description.length;
    const stringLengthOfEachItem =
      lengthOfDescription / context.context.content.length;
    expect(description).toBeTruthy();
    expect(stringLengthOfEachItem).toBeLessThan(250);
  });

  it('describe context, length = 100, filterNonTextContent = true', async () => {
    const context = await getContextFromFixture('todo');

    const { description } = await describeUserPage(context.context, {
      truncateTextLength: 100,
      filterNonTextContent: true,
      domIncluded: true,
    });

    const stringLengthOfEachItem =
      description.length / context.context.content.length;
    expect(description).toBeTruthy();
    expect(stringLengthOfEachItem).toBeLessThan(160);

    expect(description.length).toBeLessThan(lengthOfDescription);
  });
});
