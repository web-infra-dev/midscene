import { getModelRuntime } from '@/ai-model/models';
import { buildStandardPlanningSystemPrompt } from '@/ai-model/prompt/planning';
import { buildPlanningActionSpaceDescription } from '@/ai-model/prompt/planning/action-space-description';
import {
  type PlanningAblationPart,
  parsePlanningAblation,
} from '@/ai-model/workflows/planning/ablation';
import { defineActionInput, defineActionSwipe } from '@/device';
import {
  INCREMENTAL_EDIT_GUIDANCE,
  USER_REQUEST_ONLY_GUIDANCE,
} from '@/device/action-guidance';
import { describe, expect, it, rs } from '@rstest/core';
import yaml from 'js-yaml';

const runtime = getModelRuntime({
  modelFamily: 'qwen2.5-vl',
  modelName: 'test',
  modelDescription: 'test',
  intent: 'planning',
  slot: 'planning',
});
if (runtime.adapter.planning.kind !== 'standard')
  throw new Error('Expected standard planning');
const planningProtocol = runtime.adapter.planning.protocol;
const locatePromptSpec = runtime.adapter.planning.locateResultCodec!.promptSpec;
const actions = [
  defineActionInput({
    typeText: rs.fn(),
    clearInput: rs.fn(),
    keyboardPress: rs.fn(),
  }),
  defineActionSwipe({
    swipe: rs.fn(),
    size: async () => ({ width: 100, height: 100 }),
  }),
  {
    name: 'RunAdbShell',
    description: 'Execute an ADB shell command',
    call: rs.fn(),
  },
];
const prompt = (disabled: string) =>
  buildStandardPlanningSystemPrompt({
    actionSpace: actions,
    includeLocateInPlanning: true,
    locatePromptSpec,
    planningProtocol,
    ablation: parsePlanningAblation(disabled),
  });

// Each entry includes an observable instruction or example, not merely its title.
const removedFragments: Partial<Record<PlanningAblationPart, string[]>> = {
  taskScope: [
    'CRITICAL - Following Explicit Instructions',
    'Do NOT perform any action beyond the explicit instruction',
    'Do not set it unless the user asks',
    'Note: The instruction is to fill the form only',
  ],
  durableCompletion: [
    "Continue through the app/page's normal completion control",
  ],
  processEvidence: [
    'Do NOT infer that earlier steps were executed',
    'the current execution history shows that all steps required',
  ],
  observationGuidance: ['Treat visible summaries, thumbnails, cropped content'],
  planningText: ['<planning>', '</planning>'],
  subGoals: [
    '<update-plan-content>',
    '<sub-goal',
    '<mark-sub-goal-done>',
    'sub-goals',
    'sub-goal',
    'If the user wants to "log in to a system',
    'After logging in and seeing the to-do items',
  ],
  memory: ['<memory>', '</memory>', 'memory should preserve'],
  log: [
    '<log>',
    '</log>',
    'previous logs',
    'Actions performed for current sub-goal:',
  ],
  scrollableOptions: [
    'scrolling the open list/dropdown before giving up',
    'typically 50-120 pixels',
  ],
  inputVerification: [
    'Input verification after an input action',
    'you MUST directly treat that input as successful',
  ],
  assertionTiming: ['mark the goal as failed', 'do NOT assert yet'],
  recoveryGuidance: [
    'retry or do something else to recover',
    'If the error persists for more than 3 times',
    "Previous actions failed to find the 'Yes' button",
  ],
  adbPreference: ['prefer using the RunAdbShell action'],
  sliderSwipe: [
    'prefer Swipe from the current handle',
    'adjust a continuous control such as a slider',
  ],
  incrementalEdit: [
    'minimal necessary characters',
    'should be set explicitly for incremental edits',
    'do not switch to replace as a fallback',
  ],
  actionDescriptions: [
    'Input the value into the element',
    'Delay in milliseconds between keystrokes',
    'description:',
  ],
  groundingGuidance: [
    'First identify the target primitive',
    'obey the described owner region first',
  ],
  returnFormatReminder: [
    '## Return Format',
    '**Then choose ONE of the following paths:**',
  ],
  ruleExamples: [
    '**Examples - Explicit instructions',
    'such as status, price, date, owner',
    'For example: "fill out the form"',
  ],
  actionExamples: [
    'sample: |',
    'If the selected action provides a "sample"',
    'Add to cart button for Sauce Labs Backpack',
    '<error>Unable to find the required element on the page</error>',
  ],
  multiTurnExample: [
    '## Multi-turn Conversation Example',
    '### Turn 5 - After entering email',
  ],
};

describe('independent Planning prompt parts', () => {
  for (const [part, fragments] of Object.entries(removedFragments)) {
    it(`removes ${part} throughout the generated prompt`, async () => {
      const before = await prompt('');
      const after = await prompt(part);
      for (const fragment of fragments) {
        expect(before).toContain(fragment);
        expect(after).not.toContain(fragment);
      }
      expect(after).toContain('Give just the next ONE action');
      expect(after).toContain('Parameter names are strict');
      expect(after).toContain('success="true|false"');
      expect(after).toContain('RunAdbShell');
    });
  }

  it('keeps the other enabled components when memory, plan or reasoning is removed', async () => {
    const withoutGoals = await prompt('subGoals');
    expect(withoutGoals).toContain('<memory>');
    expect(withoutGoals).toContain('### Observation Guidelines');
    expect(withoutGoals).not.toContain('Page navigation restriction');
    const withoutMemory = await prompt('memory');
    expect(withoutMemory).toContain('<update-plan-content>');
    const withoutThought = await prompt('planningText');
    expect(withoutThought).toContain(
      'CRITICAL - Following Explicit Instructions',
    );
    expect(withoutThought).toContain('<update-plan-content>');
  });

  it('controls the current-page restriction independently', async () => {
    expect(await prompt('')).not.toContain('Page navigation restriction');
    expect(await prompt('crossPageNavigation')).toContain(
      'Page navigation restriction',
    );
    expect(await prompt('subGoals')).not.toContain(
      'Page navigation restriction',
    );
  });

  it('ties every capability example to its owner even when example switches remain on', async () => {
    for (const [part, fragments] of Object.entries({
      subGoals: [
        'sub-goal',
        '<update-plan-content>',
        'After logging in and seeing the to-do items',
      ],
      memory: ['<memory>', 'memory should preserve'],
      log: ['<log>', 'Actions performed for current sub-goal:'],
      planningText: ['<planning>', 'related tags: <planning>'],
      taskScope: ['Note: The instruction is to fill the form only'],
      recoveryGuidance: ["Previous actions failed to find the 'Yes' button"],
    })) {
      const result = await prompt(part);
      for (const fragment of fragments) expect(result).not.toContain(fragment);
      expect(result).toContain('## Multi-turn Conversation Example');
    }
    expect(await prompt('examples')).not.toContain(
      'After logging in and seeing the to-do items',
    );
    expect(await prompt('examples')).toContain('<update-plan-content>');
  });

  it('projects descriptions without changing action schemas, defaults or action implementations', () => {
    const before = buildPlanningActionSpaceDescription({
      actionSpace: actions,
      planningProtocol,
      locatePromptSpec,
    });
    const noDescriptions = buildPlanningActionSpaceDescription({
      actionSpace: actions,
      planningProtocol,
      locatePromptSpec,
      ablation: ['actionDescriptions'],
    });
    const descriptions = yaml.load(noDescriptions) as {
      type: string;
      param: Record<string, { type: string; default?: unknown }>;
      sample?: string;
    }[];
    expect(descriptions.map((action) => action.type)).toEqual([
      'Input',
      'Swipe',
      'RunAdbShell',
    ]);
    expect(descriptions[0].param.mode.default).toBe('replace');
    expect(descriptions[0].param.locate.type).toContain(
      locatePromptSpec.resultKey,
    );
    expect(descriptions[0].sample).toContain('<action-param-json>');
    expect(
      buildPlanningActionSpaceDescription({
        actionSpace: actions,
        planningProtocol,
        locatePromptSpec,
      }),
    ).toBe(before);
    expect(before).toContain(INCREMENTAL_EDIT_GUIDANCE);
    expect(before).toContain(USER_REQUEST_ONLY_GUIDANCE.trim());
  });
});
