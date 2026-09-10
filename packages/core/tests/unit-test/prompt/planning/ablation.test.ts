import { getModelRuntime } from '@/ai-model/models';
import { buildStandardPlanningSystemPrompt } from '@/ai-model/prompt/planning';
import { buildPlanningActionSpaceDescription } from '@/ai-model/prompt/planning/action-space-description';
import {
  PLANNING_ABLATION_PARTS,
  type PlanningAblationPart,
  parsePlanningAblation,
} from '@/ai-model/workflows/planning/ablation';
import {
  defineActionInput,
  defineActionSwipe,
  defineActionTap,
} from '@/device';
import {
  INCREMENTAL_EDIT_GUIDANCE,
  SLIDER_SWIPE_EXAMPLE,
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

const componentExamples = {
  taskScope: [
    'For example: "fill out the form"',
    '(e.g., "click X", "type Y", "fill out the form")',
    '(e.g., "log in to the system", "complete the purchase")',
    '**Examples - Explicit instructions',
    "For example, don't try to submit the form",
    USER_REQUEST_ONLY_GUIDANCE.trim(),
  ],
  observationGuidance: [
    "if the next step is to click a button but it's not visible",
  ],
  subGoals: [
    'If the user wants to "log in to a system',
    'After logging in and seeing the to-do items',
  ],
  memory: [
    'such as status, price, date, owner',
    'record each candidate separately',
    'record the exact source value and the target field',
  ],
  log: [
    '<log>Click the login button</log>',
    "<log>Scroll to find the 'Yes' button in popup</log>",
    '<log>Go back to find the login button</log>',
  ],
  assertionTiming: [
    '(e.g., "verify that...", "check that...", "assert...")',
    '(e.g., you see a loading spinner, skeleton screen, or progress bar)',
  ],
  recoveryGuidance: [
    "Previous actions failed to find the 'Yes' button, i will try again",
  ],
  incrementalEdit: [INCREMENTAL_EDIT_GUIDANCE],
  sliderSwipe: [SLIDER_SWIPE_EXAMPLE],
} satisfies Partial<Record<PlanningAblationPart, string[]>>;

// Each entry includes an observable instruction or example, not merely its title.
const removedFragments: Partial<Record<PlanningAblationPart, string[]>> = {
  taskScope: [
    'CRITICAL - Following Explicit Instructions',
    'Do NOT perform any action beyond the explicit instruction',
    'Do not set it unless the user asks',
    'Note: The instruction is to fill the form only',
    ...componentExamples.taskScope,
  ],
  durableCompletion: [
    "Continue through the app/page's normal completion control",
  ],
  processEvidence: [
    'Do NOT infer that earlier steps were executed',
    'the current execution history shows that all steps required',
  ],
  observationGuidance: [
    'Treat visible summaries, thumbnails, cropped content',
    ...componentExamples.observationGuidance,
  ],
  planningText: ['<planning>', '</planning>'],
  subGoals: [
    '<update-plan-content>',
    '<sub-goal',
    '<mark-sub-goal-done>',
    'sub-goals',
    'sub-goal',
    ...componentExamples.subGoals,
  ],
  memory: [
    '<memory>',
    '</memory>',
    'memory should preserve',
    ...componentExamples.memory,
  ],
  log: [
    '<log>',
    '</log>',
    'previous logs',
    'Actions performed for current sub-goal:',
    ...componentExamples.log,
  ],
  scrollableOptions: [
    'scrolling the open list/dropdown before giving up',
    'typically 50-120 pixels',
  ],
  inputVerification: [
    'Input verification after an input action',
    'you MUST directly treat that input as successful',
  ],
  assertionTiming: [
    'mark the goal as failed',
    'do NOT assert yet',
    ...componentExamples.assertionTiming,
  ],
  recoveryGuidance: [
    'retry or do something else to recover',
    'If the error persists for more than 3 times',
    ...componentExamples.recoveryGuidance,
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
  groundingGuidance: [
    'First identify the target primitive',
    'obey the described owner region first',
  ],
  returnFormatReminder: [
    '## Return Format',
    '**Then choose ONE of the following paths:**',
  ],
  multiTurnExample: [
    '## Multi-turn Conversation Example',
    '### Turn 5 - After entering email',
  ],
};

describe('independent Planning prompt parts', () => {
  it.each([true, false])(
    'keeps action descriptions and format examples when optional prompt parts are disabled (inline Locate: %s)',
    async (includeLocateInPlanning) => {
      const result = await buildStandardPlanningSystemPrompt({
        actionSpace: [defineActionTap(rs.fn())],
        planningProtocol,
        ablation: PLANNING_ABLATION_PARTS.filter(
          (part) => includeLocateInPlanning || part !== 'separateLocate',
        ),
        ...(includeLocateInPlanning
          ? { includeLocateInPlanning: true, locatePromptSpec }
          : { includeLocateInPlanning: false }),
      });

      expect(result).toContain('description: Tap the element');
      expect(result).toContain('description: The element to be tapped');
      expect(result).toContain('sample: |');
      expect(result).toContain('If the selected action provides a "sample"');
      expect(result).toContain(
        '<error>Unable to find the required element on the page</error>',
      );
      const examples = [
        ...result.matchAll(
          /<action-type>Tap<\/action-type>\s*<action-param-json>\s*(.*?)\s*<\/action-param-json>/gs,
        ),
      ].map((match) => JSON.parse(match[1]));
      expect(examples).toHaveLength(2);
      expect(examples.map((example) => example.locate.prompt)).toEqual([
        'the "Submit" button',
        'Add to cart button for Sauce Labs Backpack',
      ]);
      for (const [index, example] of examples.entries()) {
        expect(example.locate).toEqual({
          prompt: example.locate.prompt,
          ...(includeLocateInPlanning
            ? {
                [locatePromptSpec.resultKey]:
                  locatePromptSpec.exampleValues[index],
              }
            : {}),
        });
      }
    },
  );

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

  for (const [part, fragments] of Object.entries(componentExamples)) {
    it(`keeps ${part} examples when every other component is disabled`, async () => {
      const result = await prompt(
        PLANNING_ABLATION_PARTS.filter((other) => other !== part).join(','),
      );
      for (const fragment of fragments) expect(result).toContain(fragment);
      expect(result).not.toContain('## Multi-turn Conversation Example');
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

  it('controls the current-page restriction and its examples together', async () => {
    const allowed = await prompt('');
    const restricted = await prompt('crossPageNavigation');
    const allDisabled = await prompt(PLANNING_ABLATION_PARTS.join(','));
    for (const fragment of [
      'Page navigation restriction',
      'do not click links that lead to other pages',
      'do not use browser back/forward',
      'do not open new URLs',
    ]) {
      expect(allowed).not.toContain(fragment);
      expect(restricted).toContain(fragment);
      expect(allDisabled).toContain(fragment);
    }
    expect(await prompt('subGoals')).not.toContain(
      'Page navigation restriction',
    );
  });

  it('ties every capability example to its owner even when multi-turn examples remain on', async () => {
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
      recoveryGuidance: componentExamples.recoveryGuidance,
    })) {
      const result = await prompt(part);
      for (const fragment of fragments) expect(result).not.toContain(fragment);
      expect(result).toContain('## Multi-turn Conversation Example');
    }
    const withoutMultiTurn = await prompt('multiTurnExample');
    expect(withoutMultiTurn).not.toContain(
      '## Multi-turn Conversation Example',
    );
    expect(withoutMultiTurn).toContain(
      'After logging in and seeing the to-do items',
    );
    expect(withoutMultiTurn).toContain('<update-plan-content>');
  });

  it('retains action and parameter descriptions while removing disabled strategy guidance', () => {
    const before = buildPlanningActionSpaceDescription({
      actionSpace: actions,
      planningProtocol,
      locatePromptSpec,
    });
    const allDisabled = buildPlanningActionSpaceDescription({
      actionSpace: actions,
      planningProtocol,
      locatePromptSpec,
      ablation: PLANNING_ABLATION_PARTS,
    });
    const descriptions = yaml.load(allDisabled) as {
      type: string;
      description: string;
      param: Record<
        string,
        { type: string; description?: string; default?: unknown }
      >;
      sample?: string;
    }[];
    expect(descriptions.map((action) => action.type)).toEqual([
      'Input',
      'Swipe',
      'RunAdbShell',
    ]);
    expect(descriptions[0].description).toBe(
      'Input the value into the element',
    );
    expect(descriptions[0].param.value.description).toContain(
      'The text to input',
    );
    expect(descriptions[0].param.mode.description).toContain(
      '"typeOnly" - type the value directly without clearing the field first',
    );
    expect(descriptions[0].param.autoDismissKeyboard.description).toBe(
      'If true, the keyboard will be dismissed after the input is completed.',
    );
    expect(descriptions[0].param.keyboardTypeDelay.description).toContain(
      'Delay in milliseconds between keystrokes',
    );
    expect(descriptions[1].description).toContain('Perform a touch gesture');
    expect(descriptions[1].description).toContain(
      'swipe-to-delete a list item',
    );
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
    expect(before).toContain(SLIDER_SWIPE_EXAMPLE);
    expect(allDisabled).not.toContain(INCREMENTAL_EDIT_GUIDANCE);
    expect(allDisabled).not.toContain(USER_REQUEST_ONLY_GUIDANCE.trim());
    expect(allDisabled).not.toContain(SLIDER_SWIPE_EXAMPLE);
  });
});
