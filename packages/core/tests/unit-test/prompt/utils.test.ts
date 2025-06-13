import { describeUserPage } from '@/ai-model/prompt/util';
import { treeToList } from '@midscene/shared/extractor';
import { getContextFromFixture } from 'tests/evaluation';
import { describe, expect, it } from 'vitest';

describe('prompt utils', () => {
  let lengthOfDescription: number;
  it('describe context ', async () => {
    const context = await getContextFromFixture('taobao');
    const { description } = await describeUserPage(context.context, {
      domIncluded: true,
      visibleOnly: false,
    });

    lengthOfDescription = description.length;
    const stringLengthOfEachItem =
      lengthOfDescription / treeToList(context.context.tree).length;
    expect(description).toBeTruthy();
    expect(stringLengthOfEachItem).toBeLessThan(250);
  });

  it('describe context, truncateTextLength = 100, filterNonTextContent = true', async () => {
    const context = await getContextFromFixture('taobao');

    const { description } = await describeUserPage(context.context, {
      truncateTextLength: 100,
      filterNonTextContent: true,
      domIncluded: true,
      visibleOnly: false,
    });

    const stringLengthOfEachItem =
      description.length / treeToList(context.context.tree).length;
    expect(description).toBeTruthy();
    expect(stringLengthOfEachItem).toBeLessThan(160);
    expect(description.length).toBeLessThan(lengthOfDescription * 0.8);
  });

  it('describe context, domIncluded = "visible-only"', async () => {
    const context = await getContextFromFixture('taobao');

    const { description } = await describeUserPage(context.context, {
      filterNonTextContent: true,
      domIncluded: 'visible-only',
    });

    expect(description).toBeTruthy();
    expect(description.length).toBeLessThan(
      treeToList(context.context.tree).length,
    );
  });
});
