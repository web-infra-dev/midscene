import { assert } from '@midscene/shared/utils';
import type { CustomPlanningDefinition } from '../../model-adapter/custom-planning-types';
import { createCoordinateDistanceToPixels } from '../../shared/model-locate-result';
import { transformMaiUiPlanningResponse } from './actions';
import {
  type MaiUiParsedPlanningResponse,
  parseMaiUiPlanningResponse,
} from './parser';
import { getMaiUiPlanPrompt } from './prompt';

export function createMaiUiPlanner(): CustomPlanningDefinition<MaiUiParsedPlanningResponse> {
  return {
    messages: {
      systemPromptPlacement: 'system-message',
      buildSystemPrompt: getMaiUiPlanPrompt,
      historyImageLimit: 5,
      buildAssistantContent: (parsedResponse) =>
        `<thinking>\n${parsedResponse.thinking}\n</thinking>\n<tool_call>\n${JSON.stringify(
          parsedResponse.toolCall,
        )}\n</tool_call>`,
    },
    coordinates: {
      shape: 'point',
      order: 'xy',
      normalizedBy: 999,
    },
    parseResponse: (rawResponse) => parseMaiUiPlanningResponse(rawResponse),
    transformActions: (parsedResponse, { options, coordinateSystem }) => {
      assert(coordinateSystem, 'MAI-UI planning requires coordinate system');
      return transformMaiUiPlanningResponse(parsedResponse, {
        actionSpace: options.actionSpace,
        coordinateDistanceToPixels: createCoordinateDistanceToPixels(
          options.context.shotSize,
          coordinateSystem,
        ),
      });
    },
    shouldContinuePlanning: (parsedResponse) =>
      parsedResponse.action.action !== 'terminate' &&
      parsedResponse.action.action !== 'answer',
    buildResponseLog: (_parsedResponse, rawResponse) => rawResponse,
  };
}
