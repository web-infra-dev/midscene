export function getBestPracticesSection(): string {
  return `## Best Practices

### Dropdowns and Option Lists

- When choosing an item from a scrollable select, dropdown, listbox, menu, or similar option list, first open the control if it is closed. Once the list is open, interact with the list itself, not the page.
- If the target option is visible in the open list, Tap that exact option immediately.
- If the list is open but the target option is not visible, try to find it by scrolling the open list/dropdown before giving up or interacting with other elements.
- For an open dropdown/list, prefer small incremental Scroll actions with an explicit distance (typically 50-120 pixels) and a locate target describing the open list/dropdown. Do NOT omit distance while searching within a list, because the default scroll distance can skip over relevant options and cause oscillation.
- While searching within an open dropdown/list, use short scrolls so intermediate options are not skipped.
- After selecting the target, if the trigger text or result text shows the requested option, treat the current selection step as fulfilled and continue evaluating the remaining user instruction.

### Text Input Fields

#### Input Verification When Text Is Clipped

- CRITICAL PRIORITY OVERRIDE - Input verification after an input action:
- This rule overrides the general requirement to verify the exact target text from the screenshot.
- If the previous step already executed an input action, and the current input field is not empty, you MUST directly treat that input as successful.
- In this situation, do NOT use the visible text in the screenshot to decide that the input is incomplete, incorrect, missing characters, out of order, or needs correction.
- Do NOT perform ClearInput, another Input, KeyboardPress, or any other action intended to "fix the input content" just because the visible text looks different from the target text, has abnormal character order, missing characters, abnormal spacing, suspicious visual recognition results, or appears to have selected/highlighted text.
- The general rule "do EXACTLY what the user asked" still applies to the intended input value you execute, but it MUST NOT be enforced by re-validating the visible text in the screenshot after the input action.
- Differences in visible text must be assumed to be caused by clipping, horizontal scrolling, narrow input fields, text selection, caret position, or visual recognition errors rather than input failure.
- Retry input only when the input field is clearly still empty, or when the page shows an explicit error message.

#### Incremental Text Editing

- When editing existing text in a UI field, preserve all existing text by moving the cursor and typing/deleting the minimal necessary characters.
- For insert/prepend/append edits, use CursorMove when the caret must be adjusted precisely, then use Input with mode "typeOnly" for inserted characters and KeyboardPress for newlines or deletion. If the caret lands in the wrong position, recover with CursorMove, KeyboardPress, or undo and retry cursor placement; do not switch to replace as a fallback for cursor placement failures.

### Sliders

- If Swipe is available in the current Action Space, for touch continuous controls that set a value along a track, such as a slider, prefer Swipe from the current handle or filled position to the requested track endpoint instead of tapping the endpoint.

### Scrollable Views and Wheel Pickers

#### Interpreting Scroll and Swipe Directions

Scroll and swipe directions can be ambiguous: they may refer to off-screen content to reveal, visible content movement, or the physical movement of a finger, pointer, or scroll wheel. Infer the intended result from the user's goal, the interaction target, the current UI, and common usage in the user's language, rather than mechanically copying the user's direction word.

In the current Action Space, \`direction\` has the following meanings:

- Scroll follows the traditional mouse-wheel convention (with natural scrolling disabled). Its direction refers to the off-screen content to reveal; under this convention, it matches the wheel movement direction and is opposite to the content movement direction.
- Swipe follows the finger-movement convention. Its direction refers to finger movement; for controls where content follows the finger, it matches the content movement direction and is opposite to the direction from which off-screen content is revealed.

Use the following priority order:

1. Prioritize the user's goal or expected result, even when it conflicts with a direction word. For example, for "swipe the date picker down to increase the date", if dates increase from top to bottom, use Swipe up to move a larger date from below into the selected position.
2. Otherwise, if the user specifies a moving object or movement path, follow that object's physical movement. For example, "swipe the finger to the left" means Swipe left; "move the page content from top to bottom" means moving content downward, corresponding to Swipe down on a page where content follows the finger.
3. Otherwise, consider the interaction target and common usage in the user's language. For content browsing, such as pages and lists, scroll directions usually refer to the off-screen content the user wants to see. For directly manipulated controls, such as sliders and wheel pickers, swipe directions usually refer to the intended movement of the control's movable part. For example, the Chinese "往下滑一下页面" and English "scroll down the page" usually mean revealing content below, corresponding to Scroll down; the Chinese "向右滑动滑块" and English "slide the slider to the right" usually mean moving the slider right, corresponding to Swipe right if using Swipe.
4. If the intent remains ambiguous, use the Scroll and Swipe direction definitions above.

After interpreting the intent, choose an appropriate Action from the current Action Space and use its supported parameters to achieve the intended result. Some actions support start and end points instead of \`direction\`. When using \`direction\`, ensure its value achieves the intended result according to the selected Action's definition.`;
}
