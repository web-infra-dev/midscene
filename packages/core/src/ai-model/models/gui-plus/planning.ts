import { assert } from '@midscene/shared/utils';
import type { CustomPlanningDefinition } from '../../model-adapter/custom-planning-types';
import { transformGuiPlusComputerUseAction } from './actions';
import { parseGuiPlusPlanningResponse } from './parser';
import { getGuiPlus20260226ComputerUsePrompt } from './prompt';

type GuiPlusParsedResponse = ReturnType<typeof parseGuiPlusPlanningResponse>;

export function createGuiPlus20260226Planner(): CustomPlanningDefinition<GuiPlusParsedResponse> {
  return {
    messages: {
      systemPromptPlacement: 'system-message',
      buildSystemPrompt: getGuiPlus20260226ComputerUsePrompt,
      historyImageLimit: 4,
      buildUserInstruction: (userInstruction) => {
        return `Please generate the next move according to the UI screenshot, instruction and previous actions.

Instruction: ${userInstruction}`;
      },
      buildAssistantContent: (parsedResponse) => {
        const firstToolCall = parsedResponse.toolCalls[0];
        return `${parsedResponse.actionText ? `Action: ${parsedResponse.actionText}\n` : ''}<tool_call>\n${JSON.stringify(
          {
            name: firstToolCall.name,
            arguments: firstToolCall.arguments,
          },
        )}\n</tool_call>`;
      },
    },
    coordinates: {
      shape: 'point',
      order: 'xy',
      normalizedBy: 1000,
    },
    parseResponse: (rawResponse) => parseGuiPlusPlanningResponse(rawResponse),
    transformActions: (parsedResponse, { coordinateSystem }) => {
      assert(coordinateSystem, 'GUI-Plus planning requires coordinate system');
      return parsedResponse.toolCalls.flatMap((toolCall) => {
        if (toolCall.name !== 'computer_use') {
          throw new Error(
            `Unsupported GUI-Plus tool "${toolCall.name}". Only computer_use is supported.`,
          );
        }
        return transformGuiPlusComputerUseAction(toolCall);
      });
    },
    shouldContinuePlanning: (_parsedResponse, actions) => {
      return !actions.some((action) => action.type === 'Finished');
    },
    buildResponseLog: (_parsedResponse, rawResponse) => rawResponse,
  };
}
