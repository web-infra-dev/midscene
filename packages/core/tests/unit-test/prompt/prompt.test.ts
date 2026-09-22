import { createDefaultInsightProtocol } from '@/ai-model/model-adapter/default-insight-protocol';
import { createDefaultSearchAreaProtocol } from '@/ai-model/model-adapter/default-locate-protocol';
import {
  buildActionDescription,
  createDefaultMidscenePlanningProtocol,
} from '@/ai-model/model-adapter/default-planning-protocol';
import type {
  PlanningActionOutputProtocol,
  StandardPlanningProtocol,
} from '@/ai-model/model-adapter/planning-protocol';
import { getModelAdapter } from '@/ai-model/models';
import { buildSearchAreaLocateSystemPrompt } from '@/ai-model/prompt/locate';
import { buildStandardPlanningSystemPrompt } from '@/ai-model/prompt/planning';
import { parseModelResponseJson } from '@/ai-model/shared/json';
import type { LocateResultPromptSpec } from '@/ai-model/shared/model-locate-result';
import { parseStandardPlanningResponse } from '@/ai-model/workflows/planning/standard-planning-parser';
import type { TModelFamily } from '@midscene/shared/env';
import { describe, expect, it, rs } from '@rstest/core';
import { z } from 'zod';
import {
  buildInsightSystemPrompt,
  extractDataQueryPrompt,
} from '../../../src/ai-model/prompt/insight';
import { mockActionSpace } from '../../common';

const defaultMidscenePlanningProtocol = createDefaultMidscenePlanningProtocol({
  jsonParser: parseModelResponseJson,
});
const defaultInsightProtocol = createDefaultInsightProtocol({
  jsonParser: parseModelResponseJson,
});
const buildDefaultInsightSystemPrompt = (
  options: {
    screenshotIncluded?: boolean;
    referenceImagesIncluded?: boolean;
  } = {},
) =>
  buildInsightSystemPrompt({
    ...options,
    insightProtocol: defaultInsightProtocol,
  });

import * as sharedEnvActual from '@midscene/shared/env' with {
  rstest: 'importActual',
};

// Mock getPreferredLanguage to ensure consistent test output
rs.mock('@midscene/shared/env', () => ({
  ...sharedEnvActual,
  getPreferredLanguage: rs.fn().mockReturnValue('English'),
}));

const locatePromptSpecFor = (
  modelFamily: TModelFamily,
): LocateResultPromptSpec => {
  const locateAdapter = getModelAdapter(modelFamily).locate;
  if (locateAdapter.kind !== 'standard') {
    throw new Error(`${modelFamily} should use standard locate adapter`);
  }
  return locateAdapter.element.resultCodec.promptSpec;
};

const defaultPlanningProtocolOptions = {
  planningProtocol: defaultMidscenePlanningProtocol,
};

describe('action space', () => {
  it('planning prompt explains how to interpret ambiguous scroll and swipe directions', async () => {
    const prompt = await buildStandardPlanningSystemPrompt({
      ...defaultPlanningProtocolOptions,
      actionSpace: mockActionSpace,
      includeLocateInPlanning: false,
    });

    expect(prompt).toContain('### Interpreting Scroll and Swipe Directions');
    expect(prompt).toContain('Scroll and swipe directions can be ambiguous:');
    expect(prompt).toContain(
      'use its supported parameters to achieve the intended result',
    );
    expect(prompt).toContain(
      'Some actions support start and end points instead of `direction`.',
    );
  });

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
      'If Swipe is available in the current Action Space, for touch continuous controls that set a value along a track, such as a slider, prefer Swipe from the current handle or filled position to the requested track endpoint instead of tapping the endpoint',
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
  it('assembles the reviewed sections and keeps sub-goals optional', async () => {
    const prompt = await buildStandardPlanningSystemPrompt({
      ...defaultPlanningProtocolOptions,
      actionSpace: mockActionSpace,
      includeLocateInPlanning: false,
    });
    const tags = [
      'role',
      'workflow',
      'planning_rules',
      'completion_rules',
      'action_rules',
      'memory_rules',
      'output_format',
      'examples',
      'best_practices',
    ];
    expect(
      [...prompt.matchAll(/^<([a-z_]+)>$/gm)].map((match) => match[1]),
    ).toEqual(tags);
    for (const tag of tags) expect(prompt.split(`</${tag}>`)).toHaveLength(2);
    expect(prompt).toContain(
      'You MUST output the <planning> tag on every turn',
    );
    expect(prompt).toContain(
      'For simple tasks with a clear, direct path, proceed without creating sub-goals.',
    );
    expect(prompt).toContain(
      'Omit both tags when proceeding without sub-goals.',
    );
    expect(prompt).toContain(
      'An existing plan remains in effect when <update-plan-content> is omitted.',
    );
    expect(prompt).toContain(
      'Write the content of the <planning> tag in English.',
    );
    expect(prompt).toContain('Use <log> for a brief English preamble');
    expect(prompt).not.toContain(
      'required when no update-plan-content is provided',
    );
    expect(prompt).not.toContain('Actions performed for current sub-goal:');
  });

  it('keeps authorization, observed completion, and component guidance together', async () => {
    const prompt = await buildStandardPlanningSystemPrompt({
      ...defaultPlanningProtocolOptions,
      actionSpace: mockActionSpace,
      includeLocateInPlanning: false,
    });
    expect(prompt).toContain('Execute ONLY those steps, nothing more.');
    expect(prompt).toContain(
      'Explicit restrictions and stopping points take priority.',
    );
    expect(prompt).toContain('If the requested result must persist');
    expect(prompt).toContain(
      'Completion Criteria for Process-required Instructions',
    );
    expect(prompt).toContain(
      'Plans and <log> preambles are not execution-result records.',
    );
    expect(prompt).toContain(
      'Sub-goal status may help track progress, but does not by itself prove completion.',
    );
    expect(prompt).toContain(
      'After navigation, scrolling, editing, deletion, saving',
    );
    const practices = prompt.split('<best_practices>')[1];
    for (const title of [
      'Dropdowns and Option Lists',
      'Text Input Fields',
      'Sliders',
      'Scrollable Views and Wheel Pickers',
    ]) {
      expect(practices).toContain(`### ${title}`);
    }
    expect(practices).toContain('50');
    expect(practices).toContain(
      'Retry input only when the input field is clearly still empty',
    );
    expect(prompt).not.toContain('## Action History');
  });

  it.each([false, true])(
    'renders executable examples with inline Locate=%s',
    async (inline) => {
      const prompt = await buildStandardPlanningSystemPrompt({
        ...defaultPlanningProtocolOptions,
        actionSpace: mockActionSpace,
        ...(inline
          ? {
              includeLocateInPlanning: true as const,
              locatePromptSpec: locatePromptSpecFor('qwen2.5-vl'),
            }
          : { includeLocateInPlanning: false as const }),
      });
      const examples = prompt.split('<examples>')[1].split('</examples>')[0];
      const responses = [
        ...examples.matchAll(/\*\*Response:\*\*\n([\s\S]*?)(?=\n\n|$)/g),
      ].map((match) => match[1]);
      expect(responses).toHaveLength(8);
      const parsed = responses.map((response) =>
        parseStandardPlanningResponse(response, {
          includeThought: true,
          actionOutputProtocol:
            defaultMidscenePlanningProtocol.actionOutputProtocol,
          actionSpace: mockActionSpace,
        }),
      );
      for (const response of parsed) {
        expect(response.thought).toBeTruthy();
        expect(
          [
            !!response.action,
            response.finalizeSuccess !== undefined,
            !!response.error,
          ].filter(Boolean),
        ).toHaveLength(1);
      }
      expect(parsed[0].updateSubGoals).toBeUndefined();
      expect(parsed[1].finalizeSuccess).toBe(true);
      expect(parsed[2].updateSubGoals).toHaveLength(2);
      expect(parsed[2].memory).toBe(
        'Company profile, Office address: 12 River Road',
      );
      expect(parsed[4].markFinishedIndexes).toBeUndefined();
      expect(parsed[5].markFinishedIndexes).toEqual([1, 2]);
      expect(parsed[6].finalizeSuccess).toBe(false);
      expect(parsed[7].error).toBeTruthy();
      const coordinateKey = locatePromptSpecFor('qwen2.5-vl').resultKey;
      for (const index of [2, 3, 4]) {
        const locate = parsed[index].action?.param?.locate;
        expect(locate?.prompt).toBeTruthy();
        expect(locate?.[coordinateKey] !== undefined).toBe(inline);
      }
    },
  );

  it('planning delegates protocol-specific content to the configured protocol', async () => {
    const actionOutputProtocol: PlanningActionOutputProtocol = {
      actionOutputTagNames: ['custom-action'],
      actionOutputRules: 'CUSTOM_ACTION_OUTPUT_RULES',
      actionOutputPlaceholder: '<custom-action>...</custom-action>',
      buildActionOutput: ({ actionName }) =>
        `<custom-action type="${actionName}"></custom-action>`,
      parseActionOutput: rs.fn(),
      parseRawLocateParameter: (value) => value as any,
    };
    const planningProtocol = {
      responsePrefix: '<response-start />',
      actionSpaceProtocol: {
        title: 'Custom action space',
        format: 'yaml',
        includeActionOutputExample: true,
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
    expect(prompt).toContain(
      'related tags: <log>, <custom-action>, <complete>, <error>',
    );
    expect(prompt).toContain('For B or C, omit <log>, <custom-action>.');
    expect(prompt).toContain('CUSTOM_ACTION_OUTPUT_RULES');
    expect(
      prompt.match(/\*\*Response:\*\*\n<response-start \/>/g),
    ).toHaveLength(8);
    expect(prompt).toContain('<custom-action type="Tap"></custom-action>');
    expect(prompt).toContain('<custom-action type="Input"></custom-action>');
    expect(prompt).not.toContain('<action-type>');
    expect(prompt).not.toContain('<action-param-json>');
  });

  it('planning with separate Locate', async () => {
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

  it('planning with Qwen inline Locate', async () => {
    const prompt = await buildStandardPlanningSystemPrompt({
      ...defaultPlanningProtocolOptions,
      actionSpace: mockActionSpace,
      locatePromptSpec: locatePromptSpecFor('qwen2.5-vl'),
      includeLocateInPlanning: true,
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

  it('section locator - gemini', () => {
    const searchAreaProtocol = createDefaultSearchAreaProtocol({
      jsonParser: parseModelResponseJson,
    });
    const prompt = buildSearchAreaLocateSystemPrompt({
      systemPromptIntroduction: searchAreaProtocol.systemPromptIntroduction,
      responseInstructions: searchAreaProtocol.buildResponseInstructions(
        locatePromptSpecFor('gemini'),
      ),
    });
    expect(prompt).toMatchSnapshot();
  });

  it('section locator - qwen', () => {
    const searchAreaProtocol = createDefaultSearchAreaProtocol({
      jsonParser: parseModelResponseJson,
    });
    const prompt = buildSearchAreaLocateSystemPrompt({
      systemPromptIntroduction: searchAreaProtocol.systemPromptIntroduction,
      responseInstructions: searchAreaProtocol.buildResponseInstructions(
        locatePromptSpecFor('qwen2.5-vl'),
      ),
    });
    expect(prompt).toMatchSnapshot();
  });
});

describe('extract element', () => {
  it('buildInsightSystemPrompt', () => {
    const prompt = buildDefaultInsightSystemPrompt();
    expect(prompt).toMatchSnapshot();
  });

  it('buildInsightSystemPrompt without screenshot', () => {
    const prompt = buildDefaultInsightSystemPrompt({
      screenshotIncluded: false,
    });
    expect(prompt).toMatchSnapshot();
  });

  it('buildInsightSystemPrompt with screenshot and reference images', () => {
    const prompt = buildDefaultInsightSystemPrompt({
      screenshotIncluded: true,
      referenceImagesIncluded: true,
    });
    expect(prompt).toMatchSnapshot();
  });

  it('buildInsightSystemPrompt with reference images and without screenshot', () => {
    const prompt = buildDefaultInsightSystemPrompt({
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
      '<CONTEXT>\nOnly include active items.\n</CONTEXT>',
    );

    expect(prompt).toContain(
      '<CONTEXT>\nOnly include active items.\n</CONTEXT>',
    );
    expect(prompt).toContain(
      '<DATA_DEMAND>\n{\n  "foo": "an array indicates the foo"\n}\n</DATA_DEMAND>',
    );
  });
});
