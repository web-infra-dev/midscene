import {
  automationUserPrompt,
  generateTaskBackgroundContext,
  planSchema,
  systemPromptToTaskPlanning,
} from '@/ai-model/prompt/llm-planning';
import { describe, expect, it } from 'vitest';

describe('system prompt to task planning', () => {
  it('planning - 4o', async () => {
    process.env.MIDSCENE_USE_QWEN_VL = 'false';
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
    );
    expect(context).toMatchSnapshot();
  });

  it('planning - user prompt - 4o', async () => {
    process.env.MIDSCENE_USE_QWEN_VL = 'false';
    const prompt = automationUserPrompt();
    const result = await prompt.format({
      pageDescription: 'THIS IS PAGE DESCRIPTION',
      taskBackgroundContext: 'THIS IS BACKGROUND CONTEXT',
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
});
