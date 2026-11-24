import type {
  Capabilities,
  Client,
  ClientOptions,
  ErrorReason,
  InputEvent,
  Session,
} from 'screen-relay';

export type ScreenRelayCapabilities = Capabilities;
export type ScreenRelayInputEvent = InputEvent;
export type ScreenRelayControlSession = Pick<Session, 'input' | 'close'>;

export interface ScreenRelayClient extends Client {
  /**
   * Open a stateful `/control` WebSocket session for multi-step gestures
   * (such as drag-and-drop) that must keep a mouse button held across steps.
   */
  openControlSession?(): Promise<ScreenRelayControlSession>;
}

interface RelayErrorLike extends Error {
  reason: ErrorReason;
}

export function isRelayError(error: unknown): error is RelayErrorLike {
  return (
    error instanceof Error &&
    'reason' in error &&
    typeof (error as { reason?: unknown }).reason === 'string'
  );
}

// Use native dynamic import so CJS consumers can load ESM-only `screen-relay`.
const dynamicImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string,
) => Promise<typeof import('screen-relay')>;

let sdkPromise: Promise<typeof import('screen-relay')> | undefined;

function loadScreenRelaySdk(): Promise<typeof import('screen-relay')> {
  sdkPromise ??= dynamicImport('screen-relay');
  return sdkPromise;
}

/**
 * Create a `ScreenRelayClient` backed by `screen-relay`'s ESM SDK.
 * Lazily loads the underlying ESM module on first method call so both CJS
 * and ESM consumers can import `@midscene/screen-relay` synchronously.
 */
export function createDefaultScreenRelayClient(
  opts: ClientOptions,
): ScreenRelayClient {
  let clientPromise: Promise<Client> | undefined;
  const getClient = () => {
    clientPromise ??= loadScreenRelaySdk().then((sdk) =>
      sdk.createClient(opts),
    );
    return clientPromise;
  };

  return {
    status: async () => (await getClient()).status(),
    capabilities: async () => (await getClient()).capabilities(),
    screenshot: async () => (await getClient()).screenshot(),
    click: async (x, y, options) => (await getClient()).click(x, y, options),
    move: async (x, y) => (await getClient()).move(x, y),
    scroll: async (x, y, options) => (await getClient()).scroll(x, y, options),
    key: async (...combos) => (await getClient()).key(...combos),
    type: async (text) => (await getClient()).type(text),
    input: async (events) => (await getClient()).input(events),
    clipboard: async () => (await getClient()).clipboard(),
    setClipboard: async (text) => (await getClient()).setClipboard(text),
    openControlSession: async () => (await loadScreenRelaySdk()).connect(opts),
  };
}

/**
 * Wrap `screen-relay` errors with clear, actionable context (e.g. when a human
 * viewer takes input control or the session token is rejected).
 */
export function formatScreenRelayError(
  operation: string,
  error: unknown,
): Error {
  if (isRelayError(error)) {
    if (error.reason === 'control_taken' || error.reason === 'busy') {
      return new Error(
        `screen-relay ${operation} rejected (${error.reason}): input control is currently held by another viewer or session. Release control in the viewer and retry.`,
        { cause: error },
      );
    }
    if (error.reason === 'unauthorized' || error.reason === 'forbidden') {
      return new Error(
        `screen-relay ${operation} failed (${error.reason}): invalid or missing session token. Pass the full Viewer URL (#token=...) or set MIDSCENE_SCREEN_RELAY_TOKEN.`,
        { cause: error },
      );
    }
    return new Error(
      `screen-relay ${operation} failed (${error.reason}): ${error.message}`,
      { cause: error },
    );
  }
  if (error instanceof Error) {
    return error;
  }
  return new Error(`screen-relay ${operation} failed: ${String(error)}`);
}
