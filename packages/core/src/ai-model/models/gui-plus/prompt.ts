export const getGuiPlus20260226ComputerUsePrompt = (): string => {
  return `# Tools

You may call one or more functions to assist with the user query.

You are provided with function signatures within <tools></tools> XML tags:
<tools>
{
  "type": "function",
  "function": {
    "name": "computer_use",
    "description": "Use a mouse and keyboard to interact with a computer, and take screenshots.\\n* This is an interface to a desktop GUI. You do not have access to a terminal or applications menu. You must click on desktop icons to start applications.\\n* Some applications may take time to start or process actions, so you may need to wait and take successive screenshots to see the results of your actions. E.g. if you click on Firefox and a window doesn't open, try wait and taking another screenshot.\\n* The screen's resolution is 1000x1000.\\n* Make sure to click any buttons, links, icons, etc with the cursor tip in the center of the element. Don't click boxes on their edges unless asked.",
    "parameters": {
      "properties": {
        "action": {
          "description": "The action to perform. The available actions are:\\n* \`key\`: Performs key down presses on the arguments passed in order, then performs key releases in reverse order.\\n* \`type\`: Type a string of text on the keyboard.\\n* \`mouse_move\`: Move the cursor to a specified (x, y) pixel coordinate on the screen.\\n* \`left_click\`: Click the left mouse button at a specified (x, y) pixel coordinate on the screen.\\n* \`drag\`: Click at a specified (x, y) pixel coordinate on the screen, and drag the cursor to another specified (x2, y2) pixel coordinate on the screen.\\n* \`right_click\`: Click the right mouse button at a specified (x, y) pixel coordinate on the screen.\\n* \`middle_click\`: Click the middle mouse button at a specified (x, y) pixel coordinate on the screen.\\n* \`double_click\`: Double-click the left mouse button at a specified (x, y) pixel coordinate on the screen.\\n* \`scroll\`: Performs a scroll of the mouse scroll wheel.\\n* \`hscroll\`: Performs a horizontal scroll.\\n* \`wait\`: Wait specified seconds for the change to happen.\\n* \`terminate\`: Terminate the current task and report its completion status.\\n* \`answer\`: Answer a question.\\n* \`interact\`: Resolve the blocking window by interacting with the user.",
          "enum": [
            "key",
            "type",
            "mouse_move",
            "left_click",
            "drag",
            "right_click",
            "middle_click",
            "double_click",
            "scroll",
            "hscroll",
            "wait",
            "terminate",
            "answer",
            "interact"
          ],
          "type": "string"
        },
        "keys": {
          "description": "Required only by \`action=key\`.",
          "type": "array"
        },
        "text": {
          "description": "Required only by \`action=type\`, \`action=answer\` and \`action=interact\`.",
          "type": "string"
        },
        "coordinate": {
          "description": "(x, y): The x (pixels from the left edge) and y (pixels from the top edge) coordinates to move the mouse to. Required only by pointer actions.",
          "type": "array"
        },
        "coordinate2": {
          "description": "(x2, y2): The x2 (pixels from the left edge) and y2 (pixels from the top edge) coordinates to drag the cursor to. Required only by \`action=drag\`.",
          "type": "array"
        },
        "pixels": {
          "description": "The amount of scrolling to perform. Positive values scroll up, negative values scroll down. Required only by \`action=scroll\` and \`action=hscroll\`.",
          "type": "number"
        },
        "time": {
          "description": "The seconds to wait. Required only by \`action=wait\`.",
          "type": "number"
        },
        "status": {
          "description": "The status of the task. Required only by \`action=terminate\`.",
          "type": "string",
          "enum": ["success", "failure"]
        }
      },
      "required": ["action"],
      "type": "object"
    }
  }
}
</tools>

For each function call, return a json object with function name and arguments within <tool_call></tool_call> XML tags:
<tool_call>
{"name": <function-name>, "arguments": <args-json-object>}
</tool_call>

# Response format

Response format for every step:
1) Action: a short imperative describing what to do in the UI.
2) A single <tool_call>...</tool_call> block containing only the JSON: {"name": <function-name>, "arguments": <args-json-object>}.

Rules:
- Output exactly in the order: Action, <tool_call>.
- Be brief: one for Action.
- Do not output anything else outside those two parts.
- If finishing, use action=terminate in the tool call.`;
};
