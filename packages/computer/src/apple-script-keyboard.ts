import { execFileSync } from 'node:child_process';
import { getDebug } from '@midscene/shared/logger';

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

export function buildAppleScriptKeyPress(
  key: string,
  modifiers: string[] = [],
): string {
  const modifierKeys = resolveModifierKeys(modifiers);
  const modifierClause = modifierKeys.length
    ? ` using {${modifierKeys
        .map((modifier) => `${modifier} down`)
        .join(', ')}}`
    : '';
  return `tell application "System Events" to ${buildKeyCommand(key)}${modifierClause}`;
}

/** Send one key press through macOS System Events without invoking a shell. */
export function sendKeyViaAppleScript(
  key: string,
  modifiers: string[] = [],
): void {
  const script = buildAppleScriptKeyPress(key, modifiers);
  debugKeyboard('sendKeyViaAppleScript', {
    key,
    modifiers,
    script,
  });
  execFileSync('osascript', ['-e', script]);
}
