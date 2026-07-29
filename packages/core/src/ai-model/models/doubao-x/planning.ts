import type { CustomPlanningDefinition } from '../../model-adapter/custom-planning-types';
import {
  getDoubaoXFunctionDefinitions,
  transformDoubaoXActions,
} from './actions';
import { parseDoubaoXPlanningResponse } from './parser';
import { getDoubaoXPlanningPrompt } from './prompt';

type DoubaoXParsedResponse = ReturnType<typeof parseDoubaoXPlanningResponse>;

export function createDoubaoXPlanner(): CustomPlanningDefinition<DoubaoXParsedResponse> {
  return {
    messages: {
      systemPromptPlacement: 'system-message',
      buildSystemPrompt: (input) =>
        getDoubaoXPlanningPrompt(
          getDoubaoXFunctionDefinitions(input.options.actionSpace),
        ),
      historyImageLimit: 1,
      buildAssistantContent: (_parsedResponse, rawResponse) => rawResponse,
    },
    coordinates: { shape: 'point', order: 'xy', normalizedBy: 1000 },
    parseResponse: (rawResponse, input) =>
      parseDoubaoXPlanningResponse(
        rawResponse,
        getDoubaoXFunctionDefinitions(input.options.actionSpace),
      ),
    transformActions: (parsedResponse, input) => {
      if (parsedResponse.length === 0) {
        return [{ type: 'Finished', param: {}, thought: '' }];
      }
      return transformDoubaoXActions(parsedResponse, input.options.actionSpace);
    },
    shouldContinuePlanning: (_parsedResponse, actions) =>
      actions.every((action) => action.type !== 'Finished'),
    buildResponseLog: (_parsedResponse, rawResponse) => rawResponse,
  };
}
