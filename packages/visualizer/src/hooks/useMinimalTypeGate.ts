import type { FormInstance } from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Options for {@link useMinimalTypeGate}.
 */
export interface UseMinimalTypeGateOptions {
  /**
   * Whether the gate is active. When `false`, the hook is a no-op and all
   * returned callbacks become stable identity-only functions. Typically
   * wired to `chrome?.variant === 'minimal'`.
   */
  enabled: boolean;
  /** The antd form that owns `type` / `prompt` / `params` fields. */
  form: FormInstance;
  /** Currently selected action type (usually read via `Form.useWatch`). */
  selectedType: string | undefined;
  /**
   * Called when the gate snaps `form.type` back to its default. Hosts use
   * this hook to clear any sibling state (local `promptValue`, custom
   * history refs, etc.) alongside the form reset.
   */
  onAfterReset?: () => void;
  /**
   * The default type to snap back to when the user has not made an
   * explicit selection. Defaults to `'aiAct'`, matching the natural
   * language action.
   */
  defaultType?: string;
}

export interface MinimalTypeGate {
  /**
   * Record that the user has explicitly chosen an action — disables the
   * snap-back effect for the remainder of the component's lifecycle.
   * Call this from every user-initiated selection path: action dropdown
   * click, history replay, etc.
   */
  markExplicitSelection: () => void;
  /**
   * One-shot flag: request that the NEXT run of the caller's
   * history-restore effect be skipped entirely. Used when a history
   * replay is about to change `selectedType` and we don't want the
   * effect to overwrite the fresh form values. The flag auto-clears
   * after being read via {@link shouldSkipRestoreOnce}.
   */
  skipNextRestore: () => void;
  /**
   * Read-and-clear accessor for the one-shot flag set by
   * {@link skipNextRestore}.
   */
  shouldSkipRestoreOnce: () => boolean;
}

/**
 * Keeps a minimal-chrome prompt input pinned to its default type until
 * the user makes an explicit selection. The minimal chrome hides the
 * type radio row, so any background pathway that lands a non-default
 * type in the form (e.g. `lastSelectedType` restored from local
 * storage) would otherwise surface a type the user never asked for.
 *
 * Behaviour:
 * 1. While `enabled` and the user has not called `markExplicitSelection`,
 *    any `selectedType !== defaultType` triggers a form reset back to
 *    the default, clearing `prompt` and `params` along with it.
 * 2. Once the user explicitly picks something, the gate unlocks and
 *    stays unlocked for the rest of the component's life.
 * 3. `skipNextRestore` plus `shouldSkipRestoreOnce` give the caller a
 *    one-tick bypass so its own history-restore effect can skip the
 *    iteration where the type just changed due to a history replay.
 *
 * This replaces the previously inline `minimalHasExplicitTypeSelection`
 * state + `skipMinimalSyncRef` + reset effect that lived inside
 * `PromptInput`.
 */
export function useMinimalTypeGate(
  options: UseMinimalTypeGateOptions,
): MinimalTypeGate {
  const {
    enabled,
    form,
    selectedType,
    onAfterReset,
    defaultType = 'aiAct',
  } = options;

  const [hasExplicitSelection, setHasExplicitSelection] = useState(false);
  const skipNextRestoreRef = useRef(false);

  useEffect(() => {
    if (
      !enabled ||
      hasExplicitSelection ||
      !selectedType ||
      selectedType === defaultType
    ) {
      return;
    }

    // Consume any pending skip — the reset we're about to perform counts
    // as a type mutation, so any follow-up restore on the next render
    // should still happen.
    skipNextRestoreRef.current = false;

    form.setFieldsValue({
      type: defaultType,
      prompt: '',
      params: {},
    });
    onAfterReset?.();
  }, [
    enabled,
    hasExplicitSelection,
    selectedType,
    defaultType,
    form,
    onAfterReset,
  ]);

  const markExplicitSelection = useCallback(() => {
    if (!enabled) return;
    setHasExplicitSelection(true);
  }, [enabled]);

  const skipNextRestore = useCallback(() => {
    skipNextRestoreRef.current = true;
  }, []);

  const shouldSkipRestoreOnce = useCallback(() => {
    if (!skipNextRestoreRef.current) return false;
    skipNextRestoreRef.current = false;
    return true;
  }, []);

  return useMemo(
    () => ({
      markExplicitSelection,
      skipNextRestore,
      shouldSkipRestoreOnce,
    }),
    [markExplicitSelection, skipNextRestore, shouldSkipRestoreOnce],
  );
}
