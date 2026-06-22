import type { CustomPlanningDefinition } from '../../model-adapter/custom-planning-types';
import { transformManoCuaPlanningResponse } from './actions';
import {
  type ManoCuaParsedPlanningResponse,
  parseManoCuaPlanningResponse,
} from './parser';
import { getManoCuaPlanPrompt } from './prompt';

export function createManoCuaPlanner(): CustomPlanningDefinition<ManoCuaParsedPlanningResponse> {
  return {
    messages: {
      systemPromptPlacement: 'system-message',
      buildSystemPrompt: getManoCuaPlanPrompt,
      historyImageLimit: 5,
      buildAssistantContent: (parsedResponse) =>
        `<think>${parsedResponse.think}</think>\n<action_desp>${parsedResponse.actionDescription}</action_desp>\n<action>${parsedResponse.action.rawAction}</action>`,
    },
    coordinates: {
      shape: 'point',
      order: 'xy',
      normalizedBy: 1000,
    },
    parseResponse: (rawResponse) => parseManoCuaPlanningResponse(rawResponse),
    transformActions: (parsedResponse, { options }) =>
      transformManoCuaPlanningResponse(parsedResponse, {
        actionSpace: options.actionSpace,
      }),
    shouldContinuePlanning: (parsedResponse) =>
      parsedResponse.action.name !== 'finish' &&
      parsedResponse.action.name !== 'stop',
    buildResponseLog: (_parsedResponse, rawResponse) => rawResponse,
  };
}
