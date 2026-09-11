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
