export {
  AndroidTransportError,
  isAndroidTransportError,
  toAndroidTransportError,
  truncateStream,
} from './transport/errors';
export type {
  AndroidTransportErrorCode,
  AndroidTransportErrorOptions,
} from './transport/errors';

export {
  CommandRunnerError,
  DEFAULT_COMMAND_TIMEOUT_MS,
  DEFAULT_MAX_STDOUT_BYTES,
  FakeCommandRunner,
  NodeCommandRunner,
  joinShellCommand,
  quoteShellArg,
} from './transport/command-runner';
export type {
  CommandRunner,
  CommandRunnerFailureKind,
  CommandRunnerOptions,
  CommandRunnerResult,
  FakeCommandCall,
  FakeCommandResponse,
} from './transport/command-runner';

export {
  CAPABILITY_PROBE_ATTEMPTS,
  DEFAULT_DISPLAY_CACHE_TTL_MS,
  DEFAULT_FILE_CHANNEL_DIR,
  DEFAULT_MAX_CONCURRENT_COMMANDS,
  DEFAULT_RISH_PATH,
  DEFAULT_SCREENSHOT_TIMEOUT_MS,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_UNSET_ENV,
  RishTransport,
} from './transport/rish';
export type { RishTransportOptions, ShellFileIo } from './transport/rish';

export {
  AdbShellTransport,
  DEFAULT_ADB_DISPLAY_CACHE_TTL_MS,
  DEFAULT_ADB_MAX_CONCURRENT_COMMANDS,
  DEFAULT_ADB_PATH,
  DEFAULT_ADB_SCREENSHOT_TIMEOUT_MS,
  DEFAULT_ADB_TIMEOUT_MS,
} from './transport/adb-shell';
export type { AdbShellTransportOptions } from './transport/adb-shell';

export {
  combinedOutputText,
  isAsciiPrintable,
  isImageBuffer,
} from './transport/payload';

export { Semaphore } from './transport/semaphore';

export {
  findDisplay,
  parseDisplayDeviceInfos,
  parseDisplayInfos,
  parseDisplays,
  parseViewports,
  parseWmDensity,
  parseWmSize,
} from './transport/parsers/display';
export type {
  CombineDisplayInput,
  RawDisplayDeviceInfo,
  RawDisplayInfo,
  RawViewport,
  Rect,
  WmDensity,
  WmSize,
} from './transport/parsers/display';

export type {
  ActivityTarget,
  AndroidCapabilities,
  AndroidTransport,
  DisplayInfo,
  DisplayQueryOptions,
  DisplayRotation,
  InputOptions,
  Point,
  ScreenshotOptions,
  ShellOptions,
  ShellResult,
  TextInputOptions,
  TextInputSupport,
  TransportBackend,
  TransportHealth,
} from './transport/types';

export {
  ANDROID_KEY_CODES,
  ANDROID_SYSTEM_KEY_CODES,
  KEYCODE_BACKSPACE,
  KEYCODE_ENTER,
  KEYCODE_FORWARD_DELETE,
  KEYCODE_MOVE_END,
  isKeyCombination,
  normalizeKeyName,
  resolveKeyCode,
} from './keycodes';

export {
  CLEAR_INPUT_KEY_REPEAT_COUNT,
  buildClearInputKeyCodes,
  createTransportInputPrimitives,
} from './input-primitives';
export type { TransportInputPrimitivesOptions } from './input-primitives';

export {
  DEFAULT_SCROLL_DURATION_MS,
  DEFAULT_SCROLL_SETTLE_MS,
  DEFAULT_SCROLL_UNTIL_TIMES,
  FAST_SCROLL_DURATION_MS,
  SCROLL_DIVISIONS,
  computeDragEndPoint,
  computeScrollGesture,
  computeScrollRequest,
  scrollUntilDelta,
} from './scroll-math';
export type { ScreenSize, ScrollRequest } from './scroll-math';

export { LocalAndroidDevice } from './device';
export type { LocalAndroidDeviceOpt } from './device';
