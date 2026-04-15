export type AutoCreateInput = Record<string, unknown> | null | undefined;

export interface ResolveAutoCreateDecisionOptions {
  autoCreateInput: AutoCreateInput;
  lastAttemptedSignature: string | null;
  blockedSignature: string | null;
}

export interface AutoCreateDecision {
  signature: string | null;
  shouldCreate: boolean;
}

export function serializeAutoCreateInput(
  autoCreateInput: AutoCreateInput,
): string | null {
  if (!autoCreateInput) {
    return null;
  }

  return JSON.stringify(autoCreateInput);
}

export function resolveAutoCreateDecision({
  autoCreateInput,
  lastAttemptedSignature,
  blockedSignature,
}: ResolveAutoCreateDecisionOptions): AutoCreateDecision {
  const signature = serializeAutoCreateInput(autoCreateInput);
  if (!signature) {
    return {
      signature: null,
      shouldCreate: false,
    };
  }

  return {
    signature,
    shouldCreate:
      signature !== lastAttemptedSignature && signature !== blockedSignature,
  };
}

export function shouldResetAutoCreateBlock(options?: {
  silent?: boolean;
}): boolean {
  return !options?.silent;
}
