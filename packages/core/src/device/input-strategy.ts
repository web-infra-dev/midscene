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

/** Platform callbacks used to send text one Unicode code point at a time. */
export type SequentialTextInputHandlers = {
  sendCharacter: (character: string) => unknown;
  wait: (delayMs: number) => unknown;
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

  const resolved = inputStrategy === undefined ? 'legacy' : inputStrategy;
  if (!inputStrategies.includes(resolved)) {
    throw new Error(
      `inputStrategy must be one of: ${inputStrategies.join(', ')}; received ${String(resolved)}`,
    );
  }
  if (
    resolved === 'bulk' &&
    keyboardTypeDelay !== undefined &&
    keyboardTypeDelay > 0
  ) {
    throw new Error(
      'inputStrategy "bulk" requires keyboardTypeDelay to be omitted or set to 0; use inputStrategy "sequential" for delayed input',
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
    actionOptions?.inputStrategy !== undefined
      ? actionOptions.inputStrategy
      : platformDefaults?.inputStrategy,
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

/**
 * Send text one Unicode code point at a time with one canonical delay policy.
 * `delayAfterLast` exists only for platforms whose legacy behavior included a
 * trailing delay; explicit sequential input should leave it disabled.
 */
export async function sendTextSequentially(
  text: string,
  handlers: SequentialTextInputHandlers,
  options?: {
    delayMs?: number;
    delayAfterLast?: boolean;
  },
): Promise<void> {
  const characters = Array.from(text);
  const delayMs = options?.delayMs ?? 0;

  for (let index = 0; index < characters.length; index++) {
    await handlers.sendCharacter(characters[index]);
    if (
      delayMs > 0 &&
      (index < characters.length - 1 || options?.delayAfterLast === true)
    ) {
      await handlers.wait(delayMs);
    }
  }
}
