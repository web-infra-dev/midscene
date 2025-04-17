import { systemPromptToLocateElement } from '@/ai-model';
import {
  automationUserPrompt,
  generateTaskBackgroundContext,
  planSchema,
  systemPromptToTaskPlanning,
} from '@/ai-model/prompt/llm-planning';
import { systemPromptToLocateSection } from '@/ai-model/prompt/llm-section-locator';
import { uiTarsPlanningPrompt } from '@/ai-model/prompt/ui-tars-planning';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('system prompts', () => {
  // Store original env values
  const originalEnvValues = {
    MIDSCENE_USE_QWEN_VL: process.env.MIDSCENE_USE_QWEN_VL,
    MIDSCENE_USE_DOUBAO_VISION: process.env.MIDSCENE_USE_DOUBAO_VISION,
    MIDSCENE_USE_VLM_UI_TARS: process.env.MIDSCENE_USE_VLM_UI_TARS,
  };

  beforeEach(() => {
    // Set all configs to false before each test
    Object.keys(originalEnvValues).forEach((key) => {
      process.env[key] = 'false';
    });
  });

  afterEach(() => {
    // Restore original values after each test
    Object.entries(originalEnvValues).forEach(([key, value]) => {
      process.env[key] = value ?? 'false';
    });
  });

  it('planning - 4o', async () => {
    const prompt = await systemPromptToTaskPlanning();
    expect(prompt).toMatchSnapshot();
  });

  it('planning - 4o - response format', () => {
    const schema = planSchema;
    expect(schema).toMatchSnapshot();
  });

  it('planning - qwen', async () => {
    process.env.MIDSCENE_USE_QWEN_VL = 'true';
    const prompt = await systemPromptToTaskPlanning();
    expect(prompt).toMatchSnapshot();
  });

  it('planning - background context', () => {
    const context = generateTaskBackgroundContext(
      'THIS IS USER INSTRUCTION',
      'THIS IS WHAT HAS BEEN DONE',
      'THIS IS BACKGROUND PROMPT',
    );
    expect(context).toMatchSnapshot();
  });

  it('planning - user prompt - 4o', async () => {
    const prompt = automationUserPrompt();
    const result = await prompt.format({
      pageDescription: 'THIS IS PAGE DESCRIPTION',
      taskBackgroundContext: 'THIS IS BACKGROUND CONTEXT',
      userActionContext: 'THIS IS BACKGROUND PROMPT',
    });
    expect(result).toMatchSnapshot();
  });

  it('planning - user prompt - qwen', async () => {
    process.env.MIDSCENE_USE_QWEN_VL = 'true';
    const prompt = automationUserPrompt();
    const result = await prompt.format({
      pageDescription: 'THIS IS PAGE DESCRIPTION',
      taskBackgroundContext: 'THIS IS BACKGROUND CONTEXT',
    });
    expect(result).toMatchSnapshot();
  });

  it('section locator', () => {
    const prompt = systemPromptToLocateSection();
    expect(prompt).toMatchSnapshot();
  });

  it('locator - 4o', () => {
    const prompt = systemPromptToLocateElement(false);
    expect(prompt).toMatchSnapshot();
  });

  it('locator - qwen', () => {
    process.env.MIDSCENE_USE_QWEN_VL = 'true';
    const prompt = systemPromptToLocateElement(true);
    expect(prompt).toMatchSnapshot();
  });

  it('ui-tars planning', () => {
    const prompt = uiTarsPlanningPrompt;
    expect(prompt).toMatchSnapshot();
  });
});
