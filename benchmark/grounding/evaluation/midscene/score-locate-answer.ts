import type { MidsceneLocateResult } from './types.js';

export function scoreLocateAnswer(input: {
  expectedOutcome: 'point' | 'refusal';
  gtBox: [number, number, number, number] | null;
  locateResult: MidsceneLocateResult;
}): { hitGt: boolean; answerCorrect: boolean } {
  const { expectedOutcome, gtBox, locateResult } = input;
  const center = locateResult.center;
  const hitGt = Boolean(
    expectedOutcome === 'point' &&
      gtBox &&
      center &&
      center[0] >= gtBox[0] &&
      center[0] <= gtBox[2] &&
      center[1] >= gtBox[1] &&
      center[1] <= gtBox[3],
  );

  return {
    hitGt,
    answerCorrect:
      expectedOutcome === 'refusal'
        ? locateResult.outcome === 'not-found'
        : hitGt,
  };
}
