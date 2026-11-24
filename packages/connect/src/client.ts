import type { DeviceAction, Size } from '@midscene/core';
import { Agent, type AgentOpt } from '@midscene/core/agent';
import {
  type AbstractInterface,
  type InputPrimitives,
  defineAction,
  defineActionsFromInputPrimitives,
} from '@midscene/core/device';
import {
  type ConnectInfo,
  DEFAULT_CONNECT_PORT,
  PROTOCOL_VERSION,
} from './device';
import { primitiveByName, systemActionConfigs } from './primitives';
import { paramsToWire, toZod } from './schema';

export interface ConnectTarget {
  /** Defaults to `MIDSCENE_CONNECT_URL`, then `http://127.0.0.1:5820`. */
  url?: string;
  /** Defaults to `MIDSCENE_CONNECT_TOKEN`. */
  token?: string;
}

export class ConnectError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

export function resolveConnectTarget(target: ConnectTarget = {}) {
  const url = (
    target.url ||
    process.env.MIDSCENE_CONNECT_URL ||
    `http://127.0.0.1:${DEFAULT_CONNECT_PORT}`
  ).replace(/\/+$/, '');
  const token = target.token || process.env.MIDSCENE_CONNECT_TOKEN || undefined;
  return { url, token };
}

/** Thin JSON client for a `midscene-connect serve` endpoint. */
export class ConnectClient {
  readonly url: string;
  private readonly token?: string;

  constructor(target: ConnectTarget = {}) {
    const resolved = resolveConnectTarget(target);
    this.url = resolved.url;
    this.token = resolved.token;
  }

  async request<T = any>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const apiUrl = `${this.url}/api${path}`;
    let res: Response;
    try {
      res = await fetch(apiUrl, {
        method,
        headers: {
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (error) {
      throw new ConnectError(
        `Cannot reach the device at ${this.url}. Start it with \`midscene-connect serve <device.mjs>\` first. (${error instanceof Error ? error.message : String(error)})`,
      );
    }
    const text = await res.text();
    let data: any;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new ConnectError(
        `Unexpected non-JSON response from ${apiUrl} (HTTP ${res.status})`,
        res.status,
      );
    }
    if (!res.ok)
      throw new ConnectError(
        data?.error ?? `HTTP ${res.status} from ${apiUrl}`,
        res.status,
        data?.code,
      );
    return data as T;
  }

  async info(): Promise<ConnectInfo> {
    const info = await this.request<ConnectInfo>('GET', '/info');
    if (info?.protocol !== PROTOCOL_VERSION)
      throw new ConnectError(
        `Unsupported protocol at ${this.url}: expected ${PROTOCOL_VERSION}, got ${JSON.stringify(info?.protocol)}`,
      );
    return info;
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** A Midscene interface whose screen and input live behind the connect protocol. */
export class RemoteDevice implements AbstractInterface {
  readonly interfaceType = 'midscene-connect';
  readonly inputPrimitives: InputPrimitives;
  private readonly actions: DeviceAction[];

  constructor(
    readonly client: ConnectClient,
    readonly info: ConnectInfo,
  ) {
    const has = (name: string) => info.primitives.includes(name);
    const call = (name: string) => {
      const spec = primitiveByName.get(name)!;
      return async (...args: any[]) => {
        await client.request(
          'POST',
          `/primitives/${name}`,
          spec.toBody(...args),
        );
      };
    };
    const optional = (name: string) => (has(name) ? call(name) : undefined);
    const touchSwipe = has('swipe') && info.pointerType === 'touch';

    this.inputPrimitives = {
      pointer: has('tap')
        ? {
            tap: call('tap'),
            doubleClick: optional('doubleClick'),
            rightClick: optional('rightClick'),
            middleClick: optional('middleClick'),
            hover: optional('hover'),
            longPress: optional('longPress'),
            dragAndDrop: optional('dragAndDrop'),
            swipe:
              has('swipe') && info.pointerType === 'mouse'
                ? call('swipe')
                : undefined,
          }
        : undefined,
      touch: touchSwipe
        ? { swipe: call('swipe'), pinch: optional('pinch') }
        : undefined,
      keyboard: has('typeText')
        ? {
            typeText: call('typeText'),
            keyboardPress: call('keyboardPress'),
            clearInput: call('clearInput'),
            cursorMove: optional('cursorMove'),
          }
        : undefined,
      scroll: has('scroll') ? { scroll: call('scroll') } : undefined,
      system: {
        backButton: optional('backButton'),
        homeButton: optional('homeButton'),
        recentAppsButton: optional('recentAppsButton'),
      },
    };

    const builtIn = defineActionsFromInputPrimitives(this.inputPrimitives, {
      size: () => this.size(),
      sleep,
      systemActions: systemActionConfigs,
    });
    const builtInNames = new Set(builtIn.map((a) => a.name));
    const custom = info.actions.map((action) => {
      if (builtInNames.has(action.name))
        throw new ConnectError(
          `Custom action "${action.name}" conflicts with a built-in action; rename it on the device`,
        );
      return defineAction({
        name: action.name,
        description: action.description,
        paramSchema: action.params ? (toZod(action.params) as any) : undefined,
        call: async (param: unknown) => {
          const res = await client.request(
            'POST',
            `/actions/${action.name}`,
            paramsToWire(action.params, param),
          );
          return res.result;
        },
      } as any) as DeviceAction;
    });
    this.actions = [...builtIn, ...custom];
  }

  static async connect(target: ConnectTarget = {}) {
    const client = new ConnectClient(target);
    return new RemoteDevice(client, await client.info());
  }

  describe() {
    return this.info.description
      ? `${this.info.name}: ${this.info.description}`
      : this.info.name;
  }

  async screenshotBase64(): Promise<string> {
    const { image } = await this.client.request<{ image: string }>(
      'GET',
      '/screenshot',
    );
    return image;
  }

  async size(): Promise<Size> {
    const { width, height } = await this.client.request<Size>('GET', '/size');
    return { width, height };
  }

  actionSpace() {
    return this.actions;
  }

  async destroy() {}
}

export interface AgentOverConnectProtocolOptions extends ConnectTarget {
  agentOptions?: AgentOpt;
}

/**
 * Create an Agent for a device served by `midscene-connect serve`.
 * The device description is added to the aiAct context unless one is given.
 */
export async function agentOverConnectProtocol(
  options: AgentOverConnectProtocolOptions = {},
): Promise<Agent<RemoteDevice>> {
  const device = await RemoteDevice.connect(options);
  const agentOptions = options.agentOptions ?? {};
  const hasContext =
    agentOptions.aiContexts?.aiAct !== undefined ||
    agentOptions.aiActContext !== undefined ||
    agentOptions.aiActionContext !== undefined;
  return new Agent(device, {
    ...agentOptions,
    ...(device.info.description && !hasContext
      ? {
          aiContexts: {
            ...agentOptions.aiContexts,
            aiAct: device.info.description,
          },
        }
      : {}),
  });
}
