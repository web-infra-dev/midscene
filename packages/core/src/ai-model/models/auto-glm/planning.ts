import { assert } from '@midscene/shared/utils';
import type { CustomPlanningDefinition } from '../../model-adapter/custom-planning-types';
import { createCoordinateDistanceToPixels } from '../../shared/model-locate-result';
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
      const distanceToScreenshotPixels = createCoordinateDistanceToPixels(
        options.context.shotSize,
        coordinateSystem,
      );
      return transformAutoGLMAction(parsedResponse.action, {
        actionSpace: options.actionSpace,
        coordinateDistanceToPixels: (delta, axis) => {
          const ratio = options.context.shrunkShotToLogicalRatio;
          assert(
            Number.isFinite(ratio) && ratio > 0,
            'Invalid screenshot-to-logical ratio for AutoGLM scroll',
          );
          // AutoGLM Swipe becomes Scroll, whose distance is already in device
          // logical units. Normalize here, not in the generic Scroll executor.
          return distanceToScreenshotPixels(delta, axis) / ratio;
        },
      });
    },
    shouldContinuePlanning: (parsedResponse) =>
      parsedResponse.action._metadata !== 'finish',
    buildResponseLog: (_parsedResponse, rawResponse) => rawResponse,
  };
}
