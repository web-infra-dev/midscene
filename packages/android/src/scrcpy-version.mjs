export const SCRCPY_PROTOCOL_VERSION = '3.3.3';
export const SCRCPY_SERVER_VERSION_TAG = `v${SCRCPY_PROTOCOL_VERSION}`;
export const SCRCPY_SERVER_VERSION_FILENAME = 'scrcpy-server.version';

export function shouldDownloadScrcpyServer(
  existingVersion,
  expectedVersion = SCRCPY_SERVER_VERSION_TAG,
) {
  return existingVersion?.trim() !== expectedVersion;
}
