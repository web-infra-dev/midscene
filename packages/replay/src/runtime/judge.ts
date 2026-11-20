import type { IModelConfig } from '@midscene/shared/env';
import { createJevChecker } from './jev';

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

export async function createReplayJev(
  resolvedConfig: IModelConfig,
): Promise<VerdictJudge> {
  const checker = await createJevChecker({ resolvedConfig });
  return {
    model: checker.model,
    detects: { pending: true, inconclusive: true },
    async judge({ criterion, frames, abortSignal }) {
      if (frames.length !== 1)
        throw new Error('Jev requires one explicit frame');
      const { base64 } = frames[0];
      const current = base64.startsWith('data:')
        ? base64
        : `data:image/${imageBytes(base64)[0] === 0xff ? 'jpeg' : 'png'};base64,${base64}`;
      let evaluatedImage: string | undefined;
      let preparation:
        | Awaited<
            ReturnType<typeof import('@midscene/core/ai-model').prepareJevImage>
          >['preparation']
        | undefined;
      const result = await checker
        .check({
          criterion,
          current,
          deadline: performance.now() + 60000,
          signal: abortSignal,
          onPreparedImage: (image, details) => {
            evaluatedImage = image;
            preparation = details;
          },
        })
        .catch((error) => {
          throw Object.assign(error, { evaluatedImage, preparation });
        });
      return {
        state: result.state,
        reason: result.reason,
        signals: result.probabilities,
        evaluatedImage,
        preparation,
      };
    },
  };
}
