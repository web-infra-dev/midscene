import {
  getAutoGLMChineseLocatePrompt,
  getAutoGLMChinesePlanPrompt,
  getAutoGLMMultilingualLocatePrompt,
  getAutoGLMMultilingualPlanPrompt,
} from '@/ai-model/models/auto-glm/prompt';
import { afterEach, beforeEach, describe, expect, it, rs } from '@rstest/core';

describe('auto-glm prompts', () => {
  beforeEach(() => {
    // Mock date to 2025-12-31 Wednesday.
    // rstest's setSystemTime requires fake timers to be enabled first
    // (unlike vitest, where setSystemTime works standalone). Fake only `Date`
    // so real setTimeout/setInterval keep working for async assertions.
    // TODO(rstest): drop useFakeTimers when setSystemTime works without it — https://github.com/web-infra-dev/rstest/issues/1462
    rs.useFakeTimers({ toFake: ['Date'] });
    rs.setSystemTime(new Date('2025-12-31T00:00:00.000Z'));
  });

  afterEach(() => {
    // Restore real timers after each test
    rs.useRealTimers();
  });

  describe('planning prompts', () => {
    it('auto-glm plan prompt - multilingual', () => {
      const prompt = getAutoGLMMultilingualPlanPrompt();
      expect(prompt).toMatchSnapshot();
    });

    it('auto-glm plan prompt - chinese', () => {
      const prompt = getAutoGLMChinesePlanPrompt();
      expect(prompt).toMatchSnapshot();
    });
  });

  describe('locate prompts', () => {
    it('auto-glm locate prompt - multilingual', () => {
      const prompt = getAutoGLMMultilingualLocatePrompt();
      expect(prompt).toMatchSnapshot();
    });

    it('auto-glm locate prompt - chinese', () => {
      const prompt = getAutoGLMChineseLocatePrompt();
      expect(prompt).toMatchSnapshot();
    });
  });
});
