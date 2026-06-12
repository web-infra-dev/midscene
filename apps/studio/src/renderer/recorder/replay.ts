import type { StudioRecordingSession } from './types';

function createAiActReplayPrompt(options: {
  markdown: string;
  title: string;
  sourceLabel: string;
}) {
  return `Replay the following Midscene Studio recording with the current UI state.

Replay source: ${options.sourceLabel}
Replay title: ${options.title}

Execution rules:
- Follow the recorded Markdown steps in order.
- Treat the recorded Markdown as a user-intent replay, not a pixel replay.
- Treat the ordered Steps as required workflow actions, not only final-state checks.
- Preserve recorded input values exactly.
- Use visible UI text, roles, labels, and recorded element descriptions to locate each target.
- When a recorded scroll or missing target involves a specific visible region such as a panel, navigation area, content pane, dialog body, table, list, or menu, scroll/search within that region instead of defaulting to the whole page or another scrollable area.
- If the current UI is not at the same prerequisite state as the next recorded step, infer the minimal visible action needed to reach that prerequisite from the recorded goal and surrounding steps.
- Treat each recorded step as an intent with an expected outcome, not as a requirement that the same intermediate UI must still exist.
- For explicit recorded actions such as entering values, submitting forms, selecting navigation items, or waiting for action-triggered navigation, do not treat a later UI state as proof that earlier actions were performed in this replay. Only the current execution history can prove that a required recorded action has already run.
- If the current UI is already ahead of an earlier required recorded action, use visible safe affordances and the recorded context to return to the earliest unsatisfied prerequisite state and perform the missing recorded action sequence.
- Before failing because the recorded target is absent, compare the current UI with the recorded goal, previous steps, and following steps. If the intended outcome of the missing step is already satisfied, mark that step as done and continue with the next unsatisfied recorded intent.
- Do not undo visible progress or change durable application state only to recreate an earlier intermediate UI. Doing so is allowed only when it is visibly safe and necessary to execute an explicit recorded workflow action that has not run in this replay.
- Stop only when the recorded intent cannot be inferred or no safe visible path exists.

Recorded Markdown:
${options.markdown}`;
}

export function createRecorderAiActReplayPrompt(
  session: StudioRecordingSession,
): string {
  const markdown = session.generatedCode?.markdown;
  if (!markdown) {
    throw new Error('Generate Markdown before replay.');
  }

  return createAiActReplayPrompt({
    markdown,
    title: session.name,
    sourceLabel: 'Studio recorder',
  });
}

export function createImportedMarkdownAiActReplayPrompt(options: {
  markdown: string;
  displayName: string;
}) {
  return createAiActReplayPrompt({
    markdown: options.markdown,
    title: options.displayName,
    sourceLabel: 'Imported Markdown replay',
  });
}

export function getRecorderYamlReplayContent(
  session: StudioRecordingSession,
): string {
  const yaml = session.generatedCode?.yaml;
  if (!yaml) {
    throw new Error('Generate YAML before replay.');
  }
  return yaml;
}
