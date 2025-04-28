import { systemPromptToLocateElement } from '@/ai-model';
import {
  automationUserPrompt,
  generateTaskBackgroundContext,
  planSchema,
  systemPromptToTaskPlanning,
} from '@/ai-model/prompt/llm-planning';
import { systemPromptToLocateSection } from '@/ai-model/prompt/llm-section-locator';
import { getUiTarsPlanningPrompt } from '@/ai-model/prompt/ui-tars-planning';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { extractDataPrompt } from '../../../src/ai-model/prompt/extraction';
import { mockNonChinaTimeZone, restoreIntl } from '../mocks/intl-mock';

describe('system prompts', () => {
  it('planning - 4o', async () => {
    const prompt = await systemPromptToTaskPlanning({
      pageType: 'puppeteer',
      vlMode: false,
    });
    expect(prompt).toMatchSnapshot();
  });

  it('planning - 4o - response format', () => {
    const schema = planSchema;
    expect(schema).toMatchSnapshot();
  });

  it('planning - qwen', async () => {
    const prompt = await systemPromptToTaskPlanning({
      pageType: 'puppeteer',
      vlMode: 'qwen-vl',
    });
    expect(prompt).toMatchSnapshot();
  });

  it('planning - gemini', async () => {
    const prompt = await systemPromptToTaskPlanning({
      pageType: 'puppeteer',
      vlMode: 'gemini',
    });
    expect(prompt).toMatchSnapshot();
  });

  it('planning - android', async () => {
    const prompt = await systemPromptToTaskPlanning({
      pageType: 'android',
      vlMode: 'qwen-vl',
    });
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
    const prompt = automationUserPrompt(false);
    const result = await prompt.format({
      pageDescription: 'THIS IS PAGE DESCRIPTION',
      taskBackgroundContext: 'THIS IS BACKGROUND CONTEXT',
      userActionContext: 'THIS IS BACKGROUND PROMPT',
    });
    expect(result).toMatchSnapshot();
  });

  it('planning - user prompt - qwen', async () => {
    const prompt = automationUserPrompt('qwen-vl');
    const result = await prompt.format({
      pageDescription: 'THIS IS PAGE DESCRIPTION',
      taskBackgroundContext: 'THIS IS BACKGROUND CONTEXT',
    });
    expect(result).toMatchSnapshot();
  });

  it('section locator - gemini', () => {
    const prompt = systemPromptToLocateSection('gemini');
    expect(prompt).toMatchSnapshot();
  });

  it('section locator - qwen', () => {
    const prompt = systemPromptToLocateSection('qwen-vl');
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
    // Mock Intl to ensure non-China timezone
    mockNonChinaTimeZone();

    const prompt = getUiTarsPlanningPrompt();
    expect(prompt).toMatchSnapshot();

    // Restore original Intl
    restoreIntl();
  });
});

describe('extract element', () => {
  it('extract element by extractDataPrompt', async () => {
    const prompt = await extractDataPrompt.format({
      pageDescription: 'todo title, string',
      dataKeys: 'todo title, string',
      dataQuery: 'todo title, string',
    });
    expect(prompt).toMatchSnapshot();
  });
});
