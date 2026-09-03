import type { StandardPlanningProtocolFactory } from '../../model-adapter/planning-protocol';
import {
  buildQwenActionDescription,
  buildQwenLocateFieldDescription,
} from './action-space';
import {
  TOOL_CALL_TAG_NAME,
  buildQwenPlanningActionOutput,
  createQwenPlanningActionOutputParser,
  parseQwenRawLocateParameter,
  serializeQwenToolCall,
} from './tool-call';

const actionOutputPlaceholder = serializeQwenToolCall({
  functionName: 'example_function_name',
  parameters: [
    { name: 'example_parameter_1', value: 'value_1' },
    {
      name: 'example_parameter_2',
      value: 'This is the value for the second parameter',
    },
  ],
});

export const createQwenPlanningProtocol: StandardPlanningProtocolFactory = ({
  jsonParser,
}) => {
  const parseActionOutput = createQwenPlanningActionOutputParser(jsonParser);

  return {
    actionSpaceProtocol: {
      title: 'Tools',
      format: 'jsonl',
      includeActionOutputExample: false,
      buildLocateFieldDescription: buildQwenLocateFieldDescription,
      buildActionDescription: buildQwenActionDescription,
    },
    actionOutputProtocol: {
      actionOutputTagNames: [TOOL_CALL_TAG_NAME],
      actionOutputRules: [
        '- Output exactly one <tool_call> block using a function from Tools.',
        '- The inner <function=...></function> block MUST be nested within <tool_call></tool_call>.',
        '- The function name MUST exactly match the name of one function in Tools.',
        '- All required parameters must be explicitly provided.',
        '- Encode arrays and objects as JSON inside their <parameter=...></parameter> blocks.',
        '- For locator parameters, preserve the target description in <prompt>element description</prompt> inside the parameter. If Tools also requires coordinates, append <coordinate>[x,y]</coordinate> inside the same parameter.',
        '- Do not output anything after the tool call.',
      ].join('\n'),
      actionOutputPlaceholder,
      buildActionOutput: buildQwenPlanningActionOutput,
      parseActionOutput,
      parseRawLocateParameter: parseQwenRawLocateParameter,
    },
  };
};
