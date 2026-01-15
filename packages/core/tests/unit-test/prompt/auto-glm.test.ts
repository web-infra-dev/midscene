import {
  getAutoGLMLocatePrompt,
  getAutoGLMPlanPrompt,
} from '@/ai-model/auto-glm/prompt';
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
      const prompt = getAutoGLMPlanPrompt('auto-glm-multilingual');
      expect(prompt).toMatchSnapshot();
    });

    it('auto-glm plan prompt - chinese', () => {
      const prompt = getAutoGLMPlanPrompt('auto-glm');
      expect(prompt).toMatchSnapshot();
    });

    it('auto-glm plan prompt - should throw error for unsupported vlMode', () => {
      expect(() => {
        // @ts-expect-error Testing invalid input
        getAutoGLMPlanPrompt('invalid-mode');
      }).toThrow('Unsupported vlMode for Auto-GLM plan prompt: invalid-mode');
    });
  });

  describe('locate prompts', () => {
    it('auto-glm locate prompt - multilingual', () => {
      const prompt = getAutoGLMLocatePrompt('auto-glm-multilingual');
      expect(prompt).toMatchSnapshot();
    });

    it('auto-glm locate prompt - chinese', () => {
      const prompt = getAutoGLMLocatePrompt('auto-glm');
      expect(prompt).toMatchSnapshot();
    });

    it('auto-glm locate prompt - should throw error for unsupported vlMode', () => {
      expect(() => {
        // @ts-expect-error Testing invalid input
        getAutoGLMLocatePrompt('invalid-mode');
      }).toThrow('Unsupported vlMode for Auto-GLM locate prompt: invalid-mode');
    });
  });
});
