export type VerdictState = 'pass' | 'fail' | 'pending' | 'inconclusive';
export type JudgeInput = {
  criterion: string;
  frames: { base64: string }[];
  abortSignal?: AbortSignal;
};
export interface VerdictJudge {
  model: string;
  detects: { pending: boolean; inconclusive: boolean };
  judge(input: JudgeInput): Promise<{
    state: VerdictState;
    reason?: string;
    signals?: Record<string, number>;
    /** Exact image after model-specific preparation. */
    evaluatedImage?: string;
    preparation?: Awaited<
      ReturnType<typeof import('@midscene/core/ai-model').prepareJevImage>
    >['preparation'];
  }>;
}
export function imageBytes(base64: string) {
  return Buffer.from(
    base64.replace(/^data:image\/[\w+.-]+;base64,/, ''),
    'base64',
  );
}
