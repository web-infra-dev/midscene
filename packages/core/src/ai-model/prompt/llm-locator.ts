import { locateGroundingRules } from './locate-grounding-rules';

export function systemPromptToLocateElement({
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
