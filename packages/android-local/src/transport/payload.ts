/**
 * Helpers shared by transport implementations.
 *
 * They live apart from any single backend because each one encodes a lesson
 * learned on a real device, and the next backend must not relearn it.
 */

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);

/** True when the buffer starts with a PNG or JPEG header. */
export function isImageBuffer(buffer: Buffer): boolean {
  if (buffer.length < 3) {
    return false;
  }

  return (
    buffer.subarray(0, 4).equals(PNG_MAGIC) ||
    buffer.subarray(0, 3).equals(JPEG_MAGIC)
  );
}

/**
 * Text form of a command result, tolerating backends that place a command's
 * output on stderr.
 *
 * Measured with rish on Android 12 + Shizuku 13.6.0: `id -u` arrived on stderr
 * with an empty stdout, while large outputs were split across both pipes. adb
 * behaves conventionally, so this helper is a no-op there.
 */
export function combinedOutputText(outcome: {
  stdout: Buffer;
  stderr: string;
}): string {
  const stdout = outcome.stdout.toString('utf8');
  return stdout.trim() !== '' ? stdout : outcome.stderr;
}

/** `input text` can only deliver printable ASCII. */
export function isAsciiPrintable(value: string): boolean {
  for (const character of value) {
    if (character === '\n') {
      continue;
    }

    const code = character.codePointAt(0) ?? 0;
    if (code < 0x20 || code > 0x7e) {
      return false;
    }
  }

  return true;
}
