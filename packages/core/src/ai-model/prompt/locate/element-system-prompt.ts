import { locateGroundingRules } from './grounding-rules';

export function buildElementLocateSystemPrompt({
  systemPromptIntroduction,
  responseInstructions,
  includeGroundingGuidance = true,
}: {
  systemPromptIntroduction: string;
  responseInstructions: string;
  includeGroundingGuidance?: boolean;
}) {
  return `
${systemPromptIntroduction}

${includeGroundingGuidance ? locateGroundingRules() : ''}

${responseInstructions}`;
}
