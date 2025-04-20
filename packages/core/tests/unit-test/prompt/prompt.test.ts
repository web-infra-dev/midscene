import { systemPromptToLocateElement } from '@/ai-model';
import {
  automationUserPrompt,
  generateTaskBackgroundContext,
  planSchema,
  systemPromptToTaskPlanning,
} from '@/ai-model/prompt/llm-planning';
import { systemPromptToLocateSection } from '@/ai-model/prompt/llm-section-locator';
import { uiTarsPlanningPrompt } from '@/ai-model/prompt/ui-tars-planning';
import { describe, expect, it } from 'vitest';

describe('system prompts', () => {
  it('planning - 4o', async () => {
    const prompt = await systemPromptToTaskPlanning(false);
    expect(prompt).toMatchSnapshot();
  });

  it('planning - 4o - response format', () => {
    const schema = planSchema;
    expect(schema).toMatchSnapshot();
  });

  it('planning - qwen', async () => {
    const prompt = await systemPromptToTaskPlanning('qwen-vl');
    expect(prompt).toMatchSnapshot();
  });

  it('planning - gemini', async () => {
    const prompt = await systemPromptToTaskPlanning('gemini');
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
    const prompt = systemPromptToLocateElement('qwen-vl');
    expect(prompt).toMatchSnapshot();
  });

  it('locator - gemini', () => {
    const prompt = systemPromptToLocateElement('gemini');
    expect(prompt).toMatchSnapshot();
  });

  it('ui-tars planning', () => {
    const prompt = uiTarsPlanningPrompt;
    expect(prompt).toMatchSnapshot();
  });
});
