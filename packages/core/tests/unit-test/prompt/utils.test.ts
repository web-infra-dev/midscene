import { describeUserPage } from '@/ai-model/prompt/util';
import { vlLocateMode } from '@midscene/shared/env';
import { getContextFromFixture } from 'tests/evaluation';
import { describe, expect, it, vi } from 'vitest';

// Mock vlLocateMode to return false during tests
vi.mock('@midscene/shared/env', async () => {
  const actual = await vi.importActual('@midscene/shared/env');
  return {
    ...actual,
    vlLocateMode: () => false,
  };
});

describe.skipIf(vlLocateMode())('prompt utils', () => {
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

    if (!vlLocateMode()) {
      expect(description.length).toBeLessThan(lengthOfDescription * 0.8);
    }
  });
});
