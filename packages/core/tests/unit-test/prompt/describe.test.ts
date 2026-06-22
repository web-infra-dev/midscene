import { elementDescriberInstruction } from '@/ai-model/prompt/describe';
import { describe, expect, it, rs } from '@rstest/core';

describe('elementDescriberInstruction', () => {
  rs.mock('@midscene/shared/env', () => ({
    getPreferredLanguage: rs.fn().mockReturnValue('English'),
  }));

  it('should return the correct instruction', () => {
    expect(elementDescriberInstruction()).toMatchSnapshot();
  });
});
