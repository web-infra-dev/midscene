import { assert } from '@midscene/shared/utils';
import { createCoordinateDistanceToPixels } from '../../shared/model-locate-result';
import type { CustomPlanningDefinition } from '../../workflows/planning/custom-planning-types';
import { transformAutoGLMAction } from './actions';
import { parseAutoGLMPlanningResponse } from './parser';
import {
  getAutoGLMChinesePlanPrompt,
  getAutoGLMMultilingualPlanPrompt,
} from './prompt';

type AutoGLMParsedResponse = ReturnType<typeof parseAutoGLMPlanningResponse>;

export function createAutoGlmPlanner(
  isMultilingual: boolean,
): CustomPlanningDefinition<AutoGLMParsedResponse> {
  return {
    messages: {
      systemPromptPlacement: 'system-message',
      buildSystemPrompt: () =>
        isMultilingual
          ? getAutoGLMMultilingualPlanPrompt()
          : getAutoGLMChinesePlanPrompt(),
      historyImageLimit: 1,
      buildAssistantContent: (parsedResponse) =>
        `<think>${parsedResponse.response.think}</think><answer>${parsedResponse.response.content}</answer>`,
    },
    coordinates: {
      shape: 'point',
      order: 'xy',
      normalizedBy: 1000,
    },
    parseResponse: (rawResponse) => {
      return parseAutoGLMPlanningResponse(rawResponse);
    },
    transformActions: (parsedResponse, { options, coordinateSystem }) => {
      assert(coordinateSystem, 'Auto-GLM planning requires coordinate system');
      return transformAutoGLMAction(parsedResponse.action, {
        actionSpace: options.actionSpace,
        coordinateDistanceToPixels: createCoordinateDistanceToPixels(
          options.context.shotSize,
          coordinateSystem,
        ),
      });
    },
    shouldContinuePlanning: (parsedResponse) =>
      parsedResponse.action._metadata !== 'finish',
    buildResponseLog: (_parsedResponse, rawResponse) => rawResponse,
  };
}
