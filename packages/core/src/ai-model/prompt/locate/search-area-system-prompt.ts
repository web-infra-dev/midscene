export function buildSearchAreaLocateSystemPrompt({
  systemPromptIntroduction,
  responseInstructions,
}: {
  systemPromptIntroduction: string;
  responseInstructions: string;
}) {
  return `
${systemPromptIntroduction}

${responseInstructions}`;
}
