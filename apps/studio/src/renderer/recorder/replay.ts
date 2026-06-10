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
- Preserve recorded input values exactly.
- Use visible UI text, roles, labels, and recorded element descriptions to locate each target.
- If the current UI is not at the same prerequisite state as the next recorded step, infer the minimal visible action needed to reach that prerequisite from the recorded goal and surrounding steps.
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
