export interface ScriptPlayerInternalOptions {
  verifyCachedActions?: boolean;
}

const internalOptionsByPlayer = new WeakMap<
  object,
  ScriptPlayerInternalOptions
>();

export function setScriptPlayerInternalOptions(
  player: object,
  options: ScriptPlayerInternalOptions | undefined,
): void {
  if (options) {
    internalOptionsByPlayer.set(player, options);
  } else {
    internalOptionsByPlayer.delete(player);
  }
}

export function getScriptPlayerInternalOptions(
  player: object,
): ScriptPlayerInternalOptions | undefined {
  return internalOptionsByPlayer.get(player);
}
