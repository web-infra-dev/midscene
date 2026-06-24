import {
  getAutoGLMChineseLocatePrompt,
  getAutoGLMChinesePlanPrompt,
  getAutoGLMMultilingualLocatePrompt,
  getAutoGLMMultilingualPlanPrompt,
} from '@/ai-model/models/auto-glm/prompt';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('auto-glm prompts', () => {
  beforeEach(() => {
    // Mock date to 2025-12-31 Wednesday
    vi.setSystemTime(new Date('2025-12-31T00:00:00.000Z'));
  });

  afterEach(() => {
    // Restore real timers after each test
    vi.useRealTimers();
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
