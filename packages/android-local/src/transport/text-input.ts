import { getDebug } from '@midscene/shared/logger';

import { quoteShellArg } from './command-runner';
import { AndroidTransportError } from './errors';
import { isAsciiPrintable } from './payload';
import type { TransportBackend } from './types';

const debugText = getDebug('android-local:text-input');

/** Where the yadb dex is expected on the device. */
export const DEFAULT_YADB_PATH = '/data/local/tmp/yadb';

/**
 * yadb entry point. yadb is a small dex that injects arbitrary text (including
 * CJK and emoji) through the framework, launched by `app_process` — the same
 * trick the ADB path uses, verified on Android 12.
 */
const YADB_MAIN_CLASS = 'com.ysbing.yadb.Main';

export function yadbDirectory(yadbPath: string): string {
  const separator = yadbPath.lastIndexOf('/');
  return separator > 0 ? yadbPath.slice(0, separator) : '/data/local/tmp';
}

export function buildYadbCommand(yadbPath: string, text: string): string {
  return `app_process -Djava.class.path=${yadbPath} ${yadbDirectory(yadbPath)} ${YADB_MAIN_CLASS} -keyboard ${quoteShellArg(text)}`;
}

export interface TextInputOptionsResolved {
  backend: TransportBackend;
  /** `" -d 0"` or an empty string. */
  displayArg: string;
  timeoutMs: number;
  /** True when the yadb dex was found on the device. */
  yadbAvailable: boolean;
  yadbPath: string;
  /** Runs one shell command, throwing on a non-zero exit. */
  run: (command: string, label: string, timeoutMs?: number) => Promise<void>;
}

/**
 * Send text to the focused field.
 *
 * - printable ASCII goes through `input text` (cheap, no extra artifact);
 * - anything else needs yadb, because `input text` only understands the
 *   current keymap and silently drops CJK/emoji otherwise;
 * - when yadb is missing the call fails loudly with provisioning instructions
 *   rather than typing a truncated string.
 */
export async function sendTextInput(
  text: string,
  options: TextInputOptionsResolved,
): Promise<void> {
  if (text.length === 0) {
    throw new AndroidTransportError('text must be a non-empty string', {
      code: 'InvalidArgument',
      backend: options.backend,
    });
  }

  if (!isAsciiPrintable(text)) {
    if (!options.yadbAvailable) {
      throw new AndroidTransportError(
        `Non-ASCII text needs the yadb helper, which was not found on the device. Push it once, e.g. \`adb push <midscene>/packages/android/bin/yadb ${options.yadbPath}\`, or install a broadcast-capable IME.`,
        {
          code: 'NotSupported',
          backend: options.backend,
          command: `app_process ... -keyboard <non-ascii> (yadb at ${options.yadbPath})`,
        },
      );
    }

    const command = buildYadbCommand(options.yadbPath, text);
    debugText(`sending ${text.length} non-ASCII characters through yadb`);
    await options.run(command, 'yadb text input', options.timeoutMs);
    return;
  }

  // `input text` cannot type a newline: send each line and commit it with ENTER.
  const segments = text.split('\n');
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index] as string;
    if (segment.length > 0) {
      await options.run(
        `input${options.displayArg} text ${quoteShellArg(segment)}`,
        'input text',
        options.timeoutMs,
      );
    }

    if (index < segments.length - 1) {
      await options.run(
        `input${options.displayArg} keyevent 66`,
        'keyevent',
        options.timeoutMs,
      );
    }
  }
}
