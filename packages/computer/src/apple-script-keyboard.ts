import { execFileSync } from 'node:child_process';
import { getDebug } from '@midscene/shared/logger';
import { US_SHIFTED_CHARACTER_KEYS } from './keyboard-layout';

const debugKeyboard = getDebug('computer:keyboard');

const APPLE_SCRIPT_KEY_CODES: Readonly<Partial<Record<string, number>>> = {
  return: 36,
  enter: 36,
  tab: 48,
  space: 49,
  backspace: 51,
  delete: 51,
  escape: 53,
  forwarddelete: 117,
  left: 123,
  right: 124,
  down: 125,
  up: 126,
  home: 115,
  end: 119,
  pageup: 116,
  pagedown: 121,
  f1: 122,
  f2: 120,
  f3: 99,
  f4: 118,
  f5: 96,
  f6: 97,
  f7: 98,
  f8: 100,
  f9: 101,
  f10: 109,
  f11: 103,
  f12: 111,
};

const APPLE_SCRIPT_MODIFIER_KEYS: Readonly<Partial<Record<string, string>>> = {
  command: 'command',
  cmd: 'command',
  control: 'control',
  ctrl: 'control',
  shift: 'shift',
  alt: 'option',
  option: 'option',
  meta: 'command',
};

/**
 * Modifier delivery mode for the macOS AppleScript keyboard backend.
 *
 * `logical` is the default for native macOS applications. `physical` emits
 * explicit modifier transitions for VNC clients and assumes an en-US mapping
 * for shifted punctuation; it should not be enabled for native applications.
 */
export type KeyboardEventMode = 'logical' | 'physical';

function buildKeyCommand(key: string): string {
  const keyCode = APPLE_SCRIPT_KEY_CODES[key.toLowerCase()];
  if (keyCode !== undefined) {
    return `key code ${keyCode}`;
  }

  const escapedKey = key.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `keystroke "${escapedKey}"`;
}

function resolveModifierKeys(modifiers: string[]): string[] {
  return modifiers
    .map((modifier) => APPLE_SCRIPT_MODIFIER_KEYS[modifier.toLowerCase()])
    .filter((modifier): modifier is string => modifier !== undefined);
}

function buildLogicalKeyPress(key: string, modifiers: string[]): string {
  const modifierKeys = resolveModifierKeys(modifiers);
  const modifierClause = modifierKeys.length
    ? ` using {${modifierKeys
        .map((modifier) => `${modifier} down`)
        .join(', ')}}`
    : '';
  return `tell application "System Events" to ${buildKeyCommand(key)}${modifierClause}`;
}

function resolvePhysicalKey(
  key: string,
  modifiers: string[],
): { key: string; modifiers: string[] } {
  const resolvedModifiers = [...modifiers];
  const shiftedBaseKey = US_SHIFTED_CHARACTER_KEYS.get(key);

  if (/^[A-Z]$/.test(key)) {
    resolvedModifiers.push('shift');
    return { key: key.toLowerCase(), modifiers: resolvedModifiers };
  }
  if (shiftedBaseKey !== undefined) {
    resolvedModifiers.push('shift');
    return { key: shiftedBaseKey, modifiers: resolvedModifiers };
  }
  return { key, modifiers: resolvedModifiers };
}

function buildPhysicalKeyPress(key: string, modifiers: string[]): string {
  const resolved = resolvePhysicalKey(key, modifiers);
  const modifierKeys = [...new Set(resolveModifierKeys(resolved.modifiers))];
  const keyCommand = buildKeyCommand(resolved.key);

  if (modifierKeys.length === 0) {
    return `tell application "System Events" to ${keyCommand}`;
  }

  const releaseCommands = [...modifierKeys]
    .reverse()
    .map((modifier) => `key up ${modifier}`);
  return [
    'tell application "System Events"',
    'try',
    ...modifierKeys.map((modifier) => `key down ${modifier}`),
    keyCommand,
    'on error errorMessage number errorNumber',
    ...releaseCommands,
    'error errorMessage number errorNumber',
    'end try',
    ...releaseCommands,
    'end tell',
  ].join('\n');
}

/** @internal exported for focused unit tests */
export function buildAppleScriptKeyPress(
  key: string,
  modifiers: string[] = [],
  eventMode: KeyboardEventMode = 'logical',
): string {
  return eventMode === 'physical'
    ? buildPhysicalKeyPress(key, modifiers)
    : buildLogicalKeyPress(key, modifiers);
}

/** Send one key press through macOS System Events without invoking a shell. */
export function sendKeyViaAppleScript(
  key: string,
  modifiers: string[] = [],
  eventMode: KeyboardEventMode = 'logical',
): void {
  const script = buildAppleScriptKeyPress(key, modifiers, eventMode);
  debugKeyboard('sendKeyViaAppleScript', {
    key,
    modifiers,
    eventMode,
    script,
  });
  execFileSync('osascript', ['-e', script]);
}
