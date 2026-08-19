import { systemPromptToLocateElement } from '@/ai-model';
import {
  buildActionDescription,
  defaultMidscenePlanningProtocol,
} from '@/ai-model/model-adapter/default-planning-protocol';
import type {
  PlanningActionOutputProtocol,
  StandardPlanningProtocol,
} from '@/ai-model/model-adapter/planning-protocol';
import { getModelAdapter } from '@/ai-model/models';
import { systemPromptToLocateSection } from '@/ai-model/prompt/llm-section-locator';
import { buildStandardPlanningSystemPrompt } from '@/ai-model/prompt/planning';
import type { LocateResultPromptSpec } from '@/ai-model/shared/model-locate-result';
import type { TModelFamily } from '@midscene/shared/env';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  extractDataQueryPrompt,
  systemPromptToExtract,
} from '../../../src/ai-model/prompt/extraction';
import { mockActionSpace } from '../../common';

// Mock getPreferredLanguage to ensure consistent test output
vi.mock('@midscene/shared/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@midscene/shared/env')>();
  return {
    ...actual,
    getPreferredLanguage: vi.fn().mockReturnValue('English'),
  };
});

const locatePromptSpecFor = (
  modelFamily: TModelFamily,
): LocateResultPromptSpec => {
  const locateAdapter = getModelAdapter(modelFamily).locate;
  if (locateAdapter.kind !== 'standard') {
    throw new Error(`${modelFamily} should use standard locate adapter`);
  }
  return locateAdapter.resultAdapter.promptSpec;
};

const defaultPlanningProtocolOptions = {
  planningProtocol: defaultMidscenePlanningProtocol,
};

describe('action space', () => {
  it('planning prompt recommends cursor-level recovery for text inserts', async () => {
    const prompt = await buildStandardPlanningSystemPrompt({
      ...defaultPlanningProtocolOptions,
      actionSpace: mockActionSpace,
      includeLocateInPlanning: false,
    });

    expect(prompt).toContain(
      'use CursorMove when the caret must be adjusted precisely',
    );
    expect(prompt).toContain(
      'do not switch to replace as a fallback for cursor placement failures',
    );
  });

  it('planning prompt recommends swipe for touch sliders', async () => {
    const prompt = await buildStandardPlanningSystemPrompt({
      ...defaultPlanningProtocolOptions,
      actionSpace: mockActionSpace,
      includeLocateInPlanning: false,
    });

    expect(prompt).not.toContain(
      "If the user's task can be completed with the RunAdbShell action, prefer using the RunAdbShell action",
    );
    expect(prompt).toContain(
      'such as a slider, prefer Swipe from the current handle or filled position to the requested track endpoint instead of tapping the endpoint',
    );
  });

  it('planning prompt recommends RunAdbShell only when action is available', async () => {
    const runAdbShellAction = {
      name: 'RunAdbShell',
      description: 'Execute ADB shell command',
      paramSchema: z.object({
        command: z.string().describe('The ADB shell command to execute'),
      }),
      call: async () => '',
    };

    const prompt = await buildStandardPlanningSystemPrompt({
      ...defaultPlanningProtocolOptions,
      actionSpace: [...mockActionSpace, runAdbShellAction],
      includeLocateInPlanning: false,
    });

    expect(prompt).toContain(
      "If the user's task can be completed with the RunAdbShell action, prefer using the RunAdbShell action",
    );
  });

  it('does not infer RunAdbShell availability from an action description', async () => {
    const prompt = await buildStandardPlanningSystemPrompt({
      ...defaultPlanningProtocolOptions,
      actionSpace: [
        {
          name: 'Tap',
          description: 'Tap the RunAdbShell button shown in the current UI',
          call: async () => {},
        },
      ],
      includeLocateInPlanning: false,
    });

    expect(prompt).not.toContain(
      "If the user's task can be completed with the RunAdbShell action, prefer using the RunAdbShell action",
    );
  });
});

describe('system prompts', () => {
  it('planning delegates protocol-specific content to the configured protocol', async () => {
    const actionOutputProtocol: PlanningActionOutputProtocol = {
      actionOutputTagNames: ['custom-action'],
      actionOutputRules: 'CUSTOM_ACTION_OUTPUT_RULES',
      actionOutputPlaceholder: '<custom-action>...</custom-action>',
      buildActionOutput: ({ actionName }) =>
        `<custom-action type="${actionName}"></custom-action>`,
      parseActionOutput: vi.fn(),
    };
    const planningProtocol = {
      actionSpaceProtocol: {
        title: 'Custom action space',
        format: 'yaml',
        buildLocateFieldDescription: () => 'CUSTOM_LOCATE_DESCRIPTION',
        buildActionDescription: (input) => ({
          marker: 'CUSTOM_ACTION_SPACE_DESCRIPTION',
          action: buildActionDescription(input),
        }),
      },
      actionOutputProtocol,
    } satisfies StandardPlanningProtocol;

    const prompt = await buildStandardPlanningSystemPrompt({
      actionSpace: mockActionSpace,
      includeLocateInPlanning: false,
      planningProtocol,
    });

    expect(prompt).toContain('### Custom action space');
    expect(prompt).toContain('CUSTOM_ACTION_SPACE_DESCRIPTION');
    expect(prompt).toContain('CUSTOM_LOCATE_DESCRIPTION');
    expect(prompt).toContain('related tags: <log>, <custom-action>, <error>');
    expect(prompt).toContain(
      'If you output <complete>, do NOT output <custom-action>. The task ends here.',
    );
    expect(prompt).toContain('CUSTOM_ACTION_OUTPUT_RULES');
    expect(prompt).toContain(
      "Don't output <custom-action> if there is no action to do.",
    );
    expect(prompt).toContain('<custom-action>...</custom-action>');
    expect(prompt).toContain('<custom-action type="Tap"></custom-action>');
    expect(prompt).toContain('<custom-action type="Input"></custom-action>');
    expect(prompt).not.toContain('<action-type>');
    expect(prompt).not.toContain('<action-param-json>');
  });

  it('planning renders the default Midscene protocol', async () => {
    const prompt = await buildStandardPlanningSystemPrompt({
      ...defaultPlanningProtocolOptions,
      actionSpace: mockActionSpace,
      includeLocateInPlanning: false,
    });

    expect(defaultMidscenePlanningProtocol.actionSpaceProtocol.title).toBe(
      'Supporting actions list',
    );
    expect(prompt).toContain(
      `### ${defaultMidscenePlanningProtocol.actionSpaceProtocol.title}`,
    );
    expect(prompt).toContain('<action-type>...</action-type>');
  });

  it('planning - cot', async () => {
    const prompt = await buildStandardPlanningSystemPrompt({
      ...defaultPlanningProtocolOptions,
      actionSpace: mockActionSpace,
      includeLocateInPlanning: false,
    });
    expect(prompt).toMatchSnapshot();
  });

  it('planning - includeLocateInPlanning requires modelFamily', async () => {
    await expect(
      // @ts-expect-error Verify the runtime guard for untyped callers.
      buildStandardPlanningSystemPrompt({
        ...defaultPlanningProtocolOptions,
        actionSpace: mockActionSpace,
        includeLocateInPlanning: true,
      }),
    ).rejects.toThrow(/MIDSCENE_MODEL_FAMILY/);
  });

  it('planning - qwen - cot', async () => {
    const prompt = await buildStandardPlanningSystemPrompt({
      ...defaultPlanningProtocolOptions,
      actionSpace: mockActionSpace,
      locatePromptSpec: locatePromptSpecFor('qwen2.5-vl'),
      includeLocateInPlanning: true,
    });
    expect(prompt).toMatchSnapshot();
  });

  it('planning - qwen - cot without bbox', async () => {
    const prompt = await buildStandardPlanningSystemPrompt({
      ...defaultPlanningProtocolOptions,
      actionSpace: mockActionSpace,
      includeLocateInPlanning: false,
    });

    expect(prompt).toMatchSnapshot();
  });

  it('planning - gemini', async () => {
    const prompt = await buildStandardPlanningSystemPrompt({
      ...defaultPlanningProtocolOptions,
      actionSpace: mockActionSpace,
      locatePromptSpec: locatePromptSpecFor('gemini'),
      includeLocateInPlanning: true,
    });
    expect(prompt).toMatchSnapshot();
  });

  it('planning - android', async () => {
    const prompt = await buildStandardPlanningSystemPrompt({
      ...defaultPlanningProtocolOptions,
      actionSpace: mockActionSpace,
      locatePromptSpec: locatePromptSpecFor('qwen2.5-vl'),
      includeLocateInPlanning: true,
    });
    expect(prompt).toMatchSnapshot();
  });

  it('planning - includeSubGoals true', async () => {
    const prompt = await buildStandardPlanningSystemPrompt({
      ...defaultPlanningProtocolOptions,
      actionSpace: mockActionSpace,
      includeLocateInPlanning: false,
      includeSubGoals: true,
    });
    expect(prompt).toMatchSnapshot();
  });

  it('planning - includeSubGoals false (default) should not contain sub-goal tags', async () => {
    const prompt = await buildStandardPlanningSystemPrompt({
      ...defaultPlanningProtocolOptions,
      actionSpace: mockActionSpace,
      includeLocateInPlanning: false,
      includeSubGoals: false,
    });

    // Should not contain sub-goal related tags and content
    expect(prompt).not.toContain('<update-plan-content>');
    expect(prompt).not.toContain('<mark-sub-goal-done>');
    expect(prompt).not.toContain('<sub-goal');

    // Should still contain planning tag
    expect(prompt).toContain('<planning>');

    // Observation Guidelines are only available in deepThink (sub-goals) mode
    expect(prompt).not.toContain('### Observation Guidelines');

    // Should have simplified Step 1 title
    expect(prompt).toContain('## Step 1: Observe (related tags: <planning>)');
    expect(prompt).not.toContain(
      '## Step 1: Observe and Plan (related tags: <planning>, <update-plan-content>, <mark-sub-goal-done>)',
    );
  });

  it('planning - fast output omits planning reasoning', async () => {
    const prompt = await buildStandardPlanningSystemPrompt({
      ...defaultPlanningProtocolOptions,
      actionSpace: mockActionSpace,
      includeLocateInPlanning: false,
      includeThought: false,
      includeLog: false,
      includeSubGoals: false,
    });

    expect(prompt).not.toContain('<planning>');
    expect(prompt).not.toContain('</planning>');
    expect(prompt).not.toContain('related tags: <planning>');
    expect(prompt).not.toContain('<log>');
    expect(prompt).not.toContain('</log>');
    expect(prompt).not.toContain('related tags: <log>');
    expect(prompt).toContain('<action-type>...</action-type>');
    expect(prompt).toContain('<action-param-json>...</action-param-json>');
    expect(prompt).toMatchSnapshot();
  });

  it('planning - includeSubGoals true should contain sub-goal tags', async () => {
    const prompt = await buildStandardPlanningSystemPrompt({
      ...defaultPlanningProtocolOptions,
      actionSpace: mockActionSpace,
      includeLocateInPlanning: false,
      includeSubGoals: true,
    });

    // Should contain sub-goal related tags and content
    expect(prompt).toContain('<update-plan-content>');
    expect(prompt).toContain('<mark-sub-goal-done>');
    expect(prompt).toContain('<sub-goal');

    // Should still contain planning tag
    expect(prompt).toContain('<planning>');

    // Observation Guidelines are only available in deepThink (sub-goals) mode
    expect(prompt).toContain('### Observation Guidelines');

    // Should have full Step 1 title with sub-goal tags
    expect(prompt).toContain(
      '## Step 1: Observe and Plan (related tags: <planning>, <update-plan-content>, <mark-sub-goal-done>)',
    );
  });

  it('planning - includeSubGoals true should include sub-goal examples', async () => {
    const prompt = await buildStandardPlanningSystemPrompt({
      ...defaultPlanningProtocolOptions,
      actionSpace: mockActionSpace,
      includeLocateInPlanning: false,
      includeSubGoals: true,
    });

    // Should contain sub-goal example content
    expect(prompt).toContain('Log in to the system');
    expect(prompt).toContain('Complete all to-do items');
    expect(prompt).toContain('Submit the registration form');
    expect(prompt).toContain('status="finished|pending"');
  });

  it('planning - includeSubGoals false should not include sub-goal examples', async () => {
    const prompt = await buildStandardPlanningSystemPrompt({
      ...defaultPlanningProtocolOptions,
      actionSpace: mockActionSpace,
      includeLocateInPlanning: false,
      includeSubGoals: false,
    });

    // Should not contain sub-goal example content
    expect(prompt).not.toContain('Log in to the system');
    expect(prompt).not.toContain('Complete all to-do items');
    expect(prompt).not.toContain('Submit the registration form');
  });

  it('planning should include priority override guidance for input verification', async () => {
    const prompt = await buildStandardPlanningSystemPrompt({
      ...defaultPlanningProtocolOptions,
      actionSpace: mockActionSpace,
      includeLocateInPlanning: false,
      includeSubGoals: false,
    });

    expect(prompt).toContain(
      'CRITICAL PRIORITY OVERRIDE - Input verification after an input action:',
    );
    expect(prompt).toContain(
      'This rule overrides the general requirement to verify the exact target text from the screenshot.',
    );
    expect(prompt).toContain(
      'If the previous step already executed an input action, and the current input field is not empty, you MUST directly treat that input as successful.',
    );
    expect(prompt).toContain(
      'The general rule "do EXACTLY what the user asked" still applies to the intended input value you execute, but it MUST NOT be enforced by re-validating the visible text in the screenshot after the input action.',
    );
  });

  it('planning should include dropdown scrolling guidance', async () => {
    const prompt = await buildStandardPlanningSystemPrompt({
      ...defaultPlanningProtocolOptions,
      actionSpace: mockActionSpace,
      includeLocateInPlanning: false,
      includeSubGoals: false,
    });

    expect(prompt).toContain('Scrollable option lists and dropdowns');
    expect(prompt).toContain(
      'When choosing an item from a scrollable select, dropdown, listbox, menu, or similar option list',
    );
    expect(prompt).toContain(
      'Once the list is open, interact with the list itself, not the page',
    );
    expect(prompt).toContain(
      'If the list is open but the target option is not visible, try to find it by scrolling the open list/dropdown',
    );
    expect(prompt).toContain(
      'prefer small incremental Scroll actions with an explicit distance',
    );
    expect(prompt).toContain(
      'treat the current selection step as fulfilled and continue evaluating the remaining user instruction',
    );
  });

  it('planning should include durable change completion guidance', async () => {
    const prompt = await buildStandardPlanningSystemPrompt({
      ...defaultPlanningProtocolOptions,
      actionSpace: mockActionSpace,
      includeLocateInPlanning: false,
      includeSubGoals: false,
    });

    expect(prompt).toContain('Change completion');
    expect(prompt).toContain('If the requested outcome is a durable change');
    expect(prompt).toContain(
      "Continue through the app/page's normal completion control such as Save, Done, Confirm, OK, Submit, Apply, Send, or Publish before completing",
    );
    expect(prompt).toContain(
      'If the user only asks for an intermediate UI state',
    );
  });

  it('planning - multi-turn example with includeSubGoals true should have sub-goal tags', async () => {
    const prompt = await buildStandardPlanningSystemPrompt({
      ...defaultPlanningProtocolOptions,
      actionSpace: mockActionSpace,
      includeLocateInPlanning: false,
      includeSubGoals: true,
    });

    // Multi-turn example should contain sub-goal related content
    expect(prompt).toContain('## Multi-turn Conversation Example');
    expect(prompt).toContain(
      '<sub-goal index="1" status="pending">Fill in the Name field',
    );
    expect(prompt).toContain('<mark-sub-goal-done>');
    expect(prompt).toContain("<memory>Name field has been filled with 'John'");
    // Should show returning specific value in complete
    expect(prompt).toContain('then return the filled email address');
    expect(prompt).toContain(
      '<complete success="true">john@example.com</complete>',
    );
  });

  it('planning - multi-turn example with includeSubGoals false should not have sub-goal tags', async () => {
    const prompt = await buildStandardPlanningSystemPrompt({
      ...defaultPlanningProtocolOptions,
      actionSpace: mockActionSpace,
      includeLocateInPlanning: false,
      includeSubGoals: false,
    });

    // Multi-turn example should exist but without sub-goal tags
    expect(prompt).toContain('## Multi-turn Conversation Example');
    expect(prompt).not.toContain('Fill in the Name field');
    expect(prompt).not.toContain(
      "<memory>Name field has been filled with 'John'",
    );
    // Should still show returning specific value in complete
    expect(prompt).toContain('then return the filled email address');
    expect(prompt).toContain(
      '<complete success="true">john@example.com</complete>',
    );
  });

  it('planning - multi-turn example with includeLocateInPlanning true should have bbox in locate', async () => {
    const prompt = await buildStandardPlanningSystemPrompt({
      ...defaultPlanningProtocolOptions,
      actionSpace: mockActionSpace,
      locatePromptSpec: locatePromptSpecFor('qwen3-vl'),
      includeLocateInPlanning: true,
      includeSubGoals: false,
    });

    // Multi-turn example should contain bbox in locate examples
    expect(prompt).toContain('## Multi-turn Conversation Example');
    expect(prompt).toContain('"bbox": [120, 180, 380, 210]'); // Name field bbox
    expect(prompt).toContain('"bbox": [120, 240, 380, 270]'); // Email field bbox
  });

  it('planning - multi-turn example with includeLocateInPlanning false should not have bbox in locate', async () => {
    const prompt = await buildStandardPlanningSystemPrompt({
      ...defaultPlanningProtocolOptions,
      actionSpace: mockActionSpace,
      includeLocateInPlanning: false,
      includeSubGoals: false,
    });

    // Multi-turn example should not contain bbox
    expect(prompt).toContain('## Multi-turn Conversation Example');
    expect(prompt).not.toContain('"bbox": [120, 180, 380, 210]');
    expect(prompt).not.toContain('"bbox": [120, 240, 380, 270]');
  });

  it('section locator - gemini', () => {
    const prompt = systemPromptToLocateSection(locatePromptSpecFor('gemini'));
    expect(prompt).toMatchSnapshot();
  });

  it('section locator - qwen', () => {
    const prompt = systemPromptToLocateSection(
      locatePromptSpecFor('qwen2.5-vl'),
    );
    expect(prompt).toMatchSnapshot();
  });

  it('locator - qwen', () => {
    const prompt = systemPromptToLocateElement(
      locatePromptSpecFor('qwen2.5-vl'),
    );
    expect(prompt).toContain('"error"?: string');
    expect(prompt).toMatchSnapshot();
  });

  it('locator - gemini', () => {
    const prompt = systemPromptToLocateElement(locatePromptSpecFor('gemini'));
    expect(prompt).toMatchSnapshot();
  });
});

describe('extract element', () => {
  it('systemPromptToExtract', () => {
    const prompt = systemPromptToExtract();
    expect(prompt).toMatchSnapshot();
  });

  it('systemPromptToExtract without screenshot', () => {
    const prompt = systemPromptToExtract({ screenshotIncluded: false });
    expect(prompt).toMatchSnapshot();
  });

  it('systemPromptToExtract with screenshot and reference images', () => {
    const prompt = systemPromptToExtract({
      screenshotIncluded: true,
      referenceImagesIncluded: true,
    });
    expect(prompt).toMatchSnapshot();
  });

  it('systemPromptToExtract with reference images and without screenshot', () => {
    const prompt = systemPromptToExtract({
      screenshotIncluded: false,
      referenceImagesIncluded: true,
    });
    expect(prompt).toMatchSnapshot();
  });

  it('extract element by extractDataPrompt', () => {
    const prompt = extractDataQueryPrompt(
      'todo title, string',
      'todo title, string',
    );
    expect(prompt).toMatchSnapshot();
  });

  it('extract element by extractDataPrompt - object', () => {
    const prompt = extractDataQueryPrompt('todo title, string', {
      foo: 'an array indicates the foo',
    });
    expect(prompt).toMatchSnapshot();
  });

  it('adds context without changing an object data demand', () => {
    const prompt = extractDataQueryPrompt(
      'todo page',
      { foo: 'an array indicates the foo' },
      'Only include active items.',
    );

    expect(prompt).toContain(
      '<CONTEXT>\nOnly include active items.\n</CONTEXT>',
    );
    expect(prompt).toContain(
      '<DATA_DEMAND>\n{\n  "foo": "an array indicates the foo"\n}\n</DATA_DEMAND>',
    );
  });
});
