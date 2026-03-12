import { AdbScrcpyOptions3_3_3 } from '@yume-chan/adb-scrcpy';
import { describe, expect, it } from 'vitest';
import {
  SCRCPY_PROTOCOL_VERSION,
  SCRCPY_SERVER_VERSION_TAG,
  shouldDownloadScrcpyServer,
} from '../../src/scrcpy-version.mjs';

describe('scrcpy server version helper', () => {
  it('uses a single hard-coded scrcpy version for runtime and server download', () => {
    const runtimeVersion = new AdbScrcpyOptions3_3_3({
      audio: false,
      control: false,
    }).version;

    expect(SCRCPY_PROTOCOL_VERSION).toBe('3.3.3');
    expect(SCRCPY_SERVER_VERSION_TAG).toBe('v3.3.3');
    expect(runtimeVersion).toBe(SCRCPY_PROTOCOL_VERSION);
  });

  it('forces a refresh when cached version metadata is missing or stale', () => {
    expect(shouldDownloadScrcpyServer(null, 'v3.3.3')).toBe(true);
    expect(shouldDownloadScrcpyServer('v3.3.4', 'v3.3.3')).toBe(true);
    expect(shouldDownloadScrcpyServer(' v3.3.3\n', 'v3.3.3')).toBe(false);
  });
});
