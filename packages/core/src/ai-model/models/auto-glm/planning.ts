import type { CustomPlanningDefinition } from '../../workflows/planning/custom-planning';
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
    parseResponse: (rawResponse) => {
      return parseAutoGLMPlanningResponse(rawResponse);
    },
    transformActions: (parsedResponse, { options }) => {
      return transformAutoGLMAction(parsedResponse.action, {
        actionSpace: options.actionSpace,
        shotSize: options.context.shotSize,
      });
    },
    shouldContinuePlanning: (parsedResponse) =>
      parsedResponse.action._metadata !== 'finish',
    buildResponseLog: (_parsedResponse, rawResponse) => rawResponse,
  };
}
