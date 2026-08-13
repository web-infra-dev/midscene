import type { DeviceAction } from '@/types';

export const buildPlanningActionGuidelines = (
  actionSpace: DeviceAction<any>[],
) => {
  const hasRunAdbShell = actionSpace.some(
    (action) => action.name === 'RunAdbShell',
  );

  const adbShellExtraRule =
    "- If the user's task can be completed with the RunAdbShell action, prefer using the RunAdbShell action.";

  return `### Action Guidelines

${hasRunAdbShell ? adbShellExtraRule : ''}
- For touch continuous controls that set a value along a track, such as a slider, prefer Swipe from the current handle or filled position to the requested track endpoint instead of tapping the endpoint.
- When editing existing text in a UI field, preserve all existing text by moving the cursor and typing/deleting the minimal necessary characters.
- For insert/prepend/append edits, use CursorMove when the caret must be adjusted precisely, then use Input with mode "typeOnly" for inserted characters and KeyboardPress for newlines or deletion. If the caret lands in the wrong position, recover with CursorMove, KeyboardPress, or undo and retry cursor placement; do not switch to replace as a fallback for cursor placement failures.
`;
};
