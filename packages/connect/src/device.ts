import { imageInfoOfBase64 } from '@midscene/shared/img';
import { primitiveByName, primitiveSpecs } from './primitives';
import {
  type ObjectParamSchema,
  type SchemaError,
  assertParamSchema,
} from './schema';

export const PROTOCOL_VERSION = 'midscene-connect/1';
/** Default `serve` port (the Playground uses 5800). */
export const DEFAULT_CONNECT_PORT = 5820;

export type PointerType = 'touch' | 'mouse';
export type ScreenSize = { width: number; height: number };

/** A device-specific action beyond the built-in primitives. */
export interface CustomAction<TParams = any> {
  description: string;
  /** JSON Schema subset; the root must be `{ type: 'object' }`. */
  params?: ObjectParamSchema;
  call(params: TParams): unknown;
}

/**
 * What `connect()` returns. Keys of `actions` that match a built-in primitive
 * name (`tap`, `swipe`, `typeText`, `homeButton`, ...) are functions with core
 * `InputPrimitives` signatures; any other key is a {@link CustomAction}.
 */
export interface DeviceConnection {
  /** A PNG/JPEG Buffer, a data URL, or raw base64 image data. */
  screenshot(): Promise<Buffer | string> | Buffer | string;
  /** Defaults to the dimensions of the current screenshot. */
  size?(): Promise<ScreenSize> | ScreenSize;
  actions?: Record<string, ((...args: any[]) => unknown) | CustomAction>;
  destroy?(): Promise<void> | void;
}

export interface DeviceMeta {
  name: string;
  description?: string;
  /** How `swipe` is performed and described to the model. Required with `swipe`. */
  pointerType?: PointerType;
}

/** A device instance, used when embedding the protocol in another server. */
export type ConnectDevice = DeviceMeta & DeviceConnection;

/** One file describes one kind of device; `options` select an instance. */
export interface DeviceDefinition<TOptions = Record<string, unknown>>
  extends DeviceMeta {
  /** JSON Schema subset describing `midscene-connect serve` options. */
  options?: ObjectParamSchema;
  connect(options: TOptions): Promise<DeviceConnection> | DeviceConnection;
}

/** Identity helper for editor type hints; a plain default export works too. */
export function defineDevice<TOptions = Record<string, unknown>>(
  definition: DeviceDefinition<TOptions>,
): DeviceDefinition<TOptions> {
  return definition;
}

/** The `/info` response. */
export interface ConnectInfo {
  protocol: typeof PROTOCOL_VERSION;
  name: string;
  description?: string;
  pointerType?: PointerType;
  primitives: string[];
  actions: { name: string; description: string; params?: ObjectParamSchema }[];
}

export interface PreparedDevice {
  info: ConnectInfo;
  primitives: Map<string, (...args: any[]) => unknown>;
  actions: Map<string, CustomAction>;
  screenshot(): Promise<{ image: string; width: number; height: number }>;
  size(): Promise<ScreenSize>;
  destroy(): Promise<void>;
}

const actionNamePattern = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

function toDataUrl(raw: Buffer | string): string {
  if (typeof raw === 'string' && raw.startsWith('data:image/')) return raw;
  const buffer = typeof raw === 'string' ? Buffer.from(raw, 'base64') : raw;
  if (!Buffer.isBuffer(buffer) || buffer.length < 4)
    throw new Error(
      'screenshot() must return a PNG/JPEG Buffer or base64 string',
    );
  const mime =
    buffer[0] === 0x89 && buffer[1] === 0x50
      ? 'image/png'
      : buffer[0] === 0xff && buffer[1] === 0xd8
        ? 'image/jpeg'
        : undefined;
  if (!mime) throw new Error('screenshot() must return a PNG or JPEG image');
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

/** Validate a device and normalize it for the server. Throws on misuse. */
export function prepareDevice(device: ConnectDevice): PreparedDevice {
  const fail = (message: string): never => {
    throw new Error(`Invalid device "${device?.name}": ${message}`);
  };
  if (!device || typeof device.name !== 'string' || !device.name.trim())
    fail('name is required');
  if (typeof device.screenshot !== 'function') fail('screenshot() is required');
  if (
    device.pointerType !== undefined &&
    device.pointerType !== 'touch' &&
    device.pointerType !== 'mouse'
  )
    fail('pointerType must be "touch" or "mouse"');

  const primitives = new Map<string, (...args: any[]) => unknown>();
  const actions = new Map<string, CustomAction>();
  for (const [name, value] of Object.entries(device.actions ?? {})) {
    if (primitiveByName.has(name)) {
      if (typeof value !== 'function')
        fail(`actions.${name} is a built-in primitive and must be a function`);
      primitives.set(name, value as (...args: any[]) => unknown);
      continue;
    }
    if (!actionNamePattern.test(name))
      fail(`actions.${name}: action names must match ${actionNamePattern}`);
    if (typeof value === 'function')
      fail(
        `actions.${name} is not a built-in primitive (${primitiveSpecs.map((p) => p.name).join(', ')}); custom actions must be { description, params?, call }`,
      );
    const custom = value as CustomAction;
    if (typeof custom?.description !== 'string' || !custom.description.trim())
      fail(`actions.${name}.description is required`);
    if (typeof custom.call !== 'function')
      fail(`actions.${name}.call must be a function`);
    if (custom.params !== undefined) {
      try {
        assertParamSchema(custom.params, 'params');
      } catch (error) {
        fail(`actions.${name}.${(error as SchemaError).message}`);
      }
      if (custom.params.type !== 'object')
        fail(`actions.${name}.params must be { type: 'object', ... }`);
    }
    actions.set(name, custom);
  }

  const has = (name: string) => primitives.has(name);
  const pointer = [
    'doubleClick',
    'rightClick',
    'middleClick',
    'hover',
    'longPress',
    'dragAndDrop',
  ];
  if (!has('tap') && pointer.some(has))
    fail(`${pointer.filter(has).join(', ')} require tap`);
  if (has('swipe') && !device.pointerType)
    fail('pointerType ("touch" or "mouse") is required when swipe is provided');
  if (has('swipe') && device.pointerType === 'mouse' && !has('tap'))
    fail('a mouse swipe requires tap');
  if (has('pinch') && !(has('swipe') && device.pointerType === 'touch'))
    fail('pinch requires swipe with pointerType "touch"');
  const keyboard = ['typeText', 'keyboardPress', 'clearInput'];
  if ([...keyboard, 'cursorMove'].some(has) && !keyboard.every(has))
    fail('typeText, keyboardPress and clearInput must be provided together');

  const screenshot = async () => {
    const image = toDataUrl(await device.screenshot());
    const { width, height } = await imageInfoOfBase64(image);
    return { image, width, height };
  };
  const size = async (): Promise<ScreenSize> => {
    if (device.size) {
      const { width, height } = await device.size();
      if (!(width > 0 && height > 0))
        throw new Error('size() returned an invalid size');
      return { width, height };
    }
    const { width, height } = await screenshot();
    return { width, height };
  };

  return {
    info: {
      protocol: PROTOCOL_VERSION,
      name: device.name,
      ...(device.description ? { description: device.description } : {}),
      ...(device.pointerType ? { pointerType: device.pointerType } : {}),
      primitives: primitiveSpecs.map((p) => p.name).filter(has),
      actions: [...actions].map(([name, action]) => ({
        name,
        description: action.description,
        ...(action.params ? { params: action.params } : {}),
      })),
    },
    primitives,
    actions,
    screenshot,
    size,
    destroy: async () => {
      await device.destroy?.();
    },
  };
}
