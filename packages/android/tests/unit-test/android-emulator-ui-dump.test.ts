import { describe, expect, it } from 'vitest';
import {
  isRetryableUiDumpError,
  isTransientAdbTransportError,
} from '../android-emulator-ui-dump';

describe('Android emulator UI dump error classification', () => {
  it.each([
    'device offline',
    'device unauthorized',
    'no devices/emulators found',
  ])('recognizes transient adb transport errors: %s', (message) => {
    const error = new Error(message);

    expect(isTransientAdbTransportError(error)).toBe(true);
    expect(isRetryableUiDumpError(error)).toBe(true);
  });

  it.each([
    'No such file or directory',
    'Android emulator returned an empty Chrome UI dump',
    'Android emulator returned an empty uiautomator dump',
    "Error executing adbExec. Original error: 'Command 'adb shell 'uiautomator dump --compressed /sdcard/window.xml'' exited with code 255'; Command output: <empty>",
  ])('retries transient UI dump failures: %s', (message) => {
    expect(isRetryableUiDumpError(new Error(message))).toBe(true);
  });

  it.each([
    'Assertion failed: expected the Settings page',
    "Command 'adb shell input keyevent 4' exited with code 255",
    "Command 'adb shell uiautomator dump' exited with code 1",
  ])('does not retry unrelated failures: %s', (message) => {
    expect(isRetryableUiDumpError(new Error(message))).toBe(false);
  });
});
