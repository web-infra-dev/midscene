import type { UITarsModelVersion } from '@midscene/shared/env';
import type { CustomPlanningDefinition } from '../../workflows/planning/custom-planning-types';
import { transformUiTarsActions } from './actions';
import {
  type UiTarsParsedPlanningResponse,
  parseUiTarsPlanningResponse,
} from './parser';
import { getSummary, getUiTarsPlanningPrompt } from './prompt';

export function createUiTarsPlanner(
  uiTarsModelVersion: UITarsModelVersion,
): CustomPlanningDefinition<UiTarsParsedPlanningResponse> {
  return {
    messages: {
      systemPromptPlacement: 'user-message',
      buildSystemPrompt: getUiTarsPlanningPrompt,
      buildUserInstruction: (instruction) =>
        `<user_instruction>${instruction}</user_instruction>`,
      buildAssistantContent: (_parsedResponse, rawResponse) =>
        getSummary(rawResponse),
    },
    coordinates: { shape: 'point', order: 'xy', normalizedBy: 1 },
    parseResponse: (rawResponse, { options }) => {
      return parseUiTarsPlanningResponse(
        rawResponse,
        options.context.shotSize,
        uiTarsModelVersion,
      );
    },
    transformActions: (parsedPlanningResponse) => {
      return transformUiTarsActions(parsedPlanningResponse);
    },
    shouldContinuePlanning: (_parsedResponse, actions) =>
      actions.every((action) => action.type !== 'Finished'),
    buildResponseLog: (_parsedResponse, rawResponse) => getSummary(rawResponse),
  };
}
