/** Supported strategies for sending text through a platform input backend. */
export const inputStrategies = ['legacy', 'sequential', 'bulk'] as const;

/**
 * `legacy` preserves the platform's pre-existing behavior, `sequential` sends
 * one Unicode code point per Midscene backend call, and `bulk` sends the full
 * value in one backend call where supported.
 */
export type InputStrategy = (typeof inputStrategies)[number];

/** Input fields that may be configured at action or platform level. */
export type TextInputOptions = {
  keyboardTypeDelay?: number;
  inputStrategy?: InputStrategy;
};

/** Effective text input configuration after layered defaults are resolved. */
export type ResolvedTextInputOptions = {
  keyboardTypeDelay?: number;
  inputStrategy: InputStrategy;
};

/**
 * Resolve an input strategy and reject combinations whose intent conflicts.
 * Prefer `resolveTextInputOptions` when both action and platform defaults exist.
 */
export function resolveInputStrategy(
  inputStrategy: InputStrategy | undefined,
  keyboardTypeDelay?: number,
): InputStrategy {
  if (
    keyboardTypeDelay !== undefined &&
    (!Number.isFinite(keyboardTypeDelay) || keyboardTypeDelay < 0)
  ) {
    throw new Error('keyboardTypeDelay must be a finite non-negative number');
  }

  const resolved = inputStrategy ?? 'legacy';
  if (
    resolved === 'bulk' &&
    keyboardTypeDelay !== undefined &&
    keyboardTypeDelay > 0
  ) {
    throw new Error(
      'inputStrategy "bulk" cannot be used with a positive keyboardTypeDelay',
    );
  }
  return resolved;
}

/** Resolve action-level text input options over platform-level defaults. */
export function resolveTextInputOptions(
  actionOptions?: TextInputOptions,
  platformDefaults?: TextInputOptions,
): ResolvedTextInputOptions {
  const keyboardTypeDelay =
    actionOptions?.keyboardTypeDelay ?? platformDefaults?.keyboardTypeDelay;
  const inputStrategy = resolveInputStrategy(
    actionOptions?.inputStrategy ?? platformDefaults?.inputStrategy,
    keyboardTypeDelay,
  );

  return { inputStrategy, keyboardTypeDelay };
}

/**
 * Whether resolved options require Midscene to send Unicode code points
 * separately.
 */
export function shouldInputSequentially({
  inputStrategy,
  keyboardTypeDelay,
}: ResolvedTextInputOptions): boolean {
  return (
    inputStrategy === 'sequential' ||
    (inputStrategy === 'legacy' &&
      keyboardTypeDelay !== undefined &&
      keyboardTypeDelay > 0)
  );
}
