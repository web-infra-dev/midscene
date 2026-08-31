import { locateGroundingRules } from './grounding-rules';

export function buildElementLocateSystemPrompt({
  systemPromptIntroduction,
  responseInstructions,
}: {
  systemPromptIntroduction: string;
  responseInstructions: string;
}) {
  return `
${systemPromptIntroduction}

${locateGroundingRules()}

${responseInstructions}`;
}
