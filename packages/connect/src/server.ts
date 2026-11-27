import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  type IncomingMessage,
  type Server,
  type ServerResponse,
  createServer,
} from 'node:http';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { getDebug } from '@midscene/shared/logger';
import {
  type ConnectDevice,
  DEFAULT_CONNECT_PORT,
  type DeviceDefinition,
  type PreparedDevice,
  prepareDevice,
} from './device';
import { buildOpenAPI } from './openapi';
import { primitiveByName } from './primitives';
import { SchemaError, assertParamSchema, validateValue } from './schema';

export { DEFAULT_CONNECT_PORT } from './device';
export type {
  ConnectDevice,
  ConnectInfo,
  CustomAction,
  DeviceConnection,
  DeviceDefinition,
} from './device';

const debug = getDebug('connect:server', { console: true });
const maxBodyBytes = 1024 * 1024;

export interface ConnectHandlerOptions {
  /** Require `Authorization: Bearer <token>` on API routes. */
  token?: string;
  /** Route prefix, useful when embedding into an existing server. */
  basePath?: string;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBodyBytes) {
        reject(
          new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large'),
        );
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8').trim();
      if (!text) return resolve({});
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(
          new HttpError(400, 'INVALID_REQUEST', 'Request body must be JSON'),
        );
      }
    });
    req.on('error', reject);
  });
}

let swaggerDir: string | undefined;
function swaggerAssetDir() {
  swaggerDir ??= dirname(
    createRequire(import.meta.url).resolve('swagger-ui-dist/package.json'),
  );
  return swaggerDir;
}
const swaggerAssets: Record<string, string> = {
  'swagger-ui.css': 'text/css; charset=utf-8',
  'swagger-ui-bundle.js': 'text/javascript; charset=utf-8',
  'favicon-32x32.png': 'image/png',
};
const docsHtml = (title: string) => `<!doctype html>
<html><head><meta charset="utf-8"><title>${title.replace(/</g, '&lt;')}</title>
<link rel="stylesheet" href="swagger-ui.css"><link rel="icon" href="favicon-32x32.png"></head>
<body><div id="swagger-ui"></div><script src="swagger-ui-bundle.js"></script>
<script src="init.js"></script></body></html>`;

/**
 * Expose a device over the Midscene Connect protocol.
 * `handle()` returns `false` for requests outside `basePath` so callers can
 * mount it next to their own routes.
 */
export function createConnectHandler(
  device: ConnectDevice | PreparedDevice,
  options: ConnectHandlerOptions = {},
) {
  const prepared =
    'info' in device &&
    'primitives' in device &&
    device.primitives instanceof Map
      ? (device as PreparedDevice)
      : prepareDevice(device as ConnectDevice);
  const basePath = (options.basePath ?? '/api').replace(/\/+$/, '');
  const token = options.token
    ? Buffer.from(`Bearer ${options.token}`)
    : undefined;
  const openAPI = JSON.stringify(
    buildOpenAPI(prepared.info, { basePath, secured: Boolean(token) }),
  );
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task);
    queue = run.catch(() => {});
    return run;
  };

  const invoke = async (name: string, call: () => unknown) => {
    try {
      return await serial(async () => call());
    } catch (error) {
      debug(`action ${name} failed:`, error);
      throw new HttpError(
        500,
        'ACTION_FAILED',
        `${name} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  async function route(req: IncomingMessage, path: string) {
    const method = req.method ?? 'GET';
    if (method === 'GET' && path === '/info') return prepared.info;
    if (method === 'GET' && path === '/screenshot')
      return prepared.screenshot();
    if (method === 'GET' && path === '/size') return prepared.size();
    const match = /^\/(primitives|actions)\/([^/]+)$/.exec(path);
    if (!match)
      throw new HttpError(404, 'NOT_FOUND', `No route for ${method} ${path}`);
    if (method !== 'POST')
      throw new HttpError(
        405,
        'METHOD_NOT_ALLOWED',
        `${path} only accepts POST`,
      );
    const [, kind, name] = match;
    const body = await readJson(req);
    if (kind === 'primitives') {
      const spec = primitiveByName.get(name);
      const fn = prepared.primitives.get(name);
      if (!spec || !fn)
        throw new HttpError(
          404,
          'NOT_FOUND',
          `Primitive "${name}" is not supported by this device`,
        );
      validate(spec.body, body);
      await invoke(name, () =>
        fn(...spec.toArgs(body as Record<string, unknown>)),
      );
      return { ok: true };
    }
    const action = prepared.actions.get(name);
    if (!action)
      throw new HttpError(404, 'NOT_FOUND', `Action "${name}" is not defined`);
    validate(action.params ?? { type: 'object', properties: {} }, body);
    const result = await invoke(name, () => action.call(body));
    return { ok: true, ...(result === undefined ? {} : { result }) };
  }

  function validate(
    schema: Parameters<typeof validateValue>[0],
    body: unknown,
  ) {
    try {
      validateValue(schema, body, 'body');
    } catch (error) {
      if (error instanceof SchemaError)
        throw new HttpError(400, 'INVALID_REQUEST', error.message);
      throw error;
    }
  }

  function serveDocs(req: IncomingMessage, res: ServerResponse, path: string) {
    if (path === '/openapi.json') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(openAPI);
    }
    if (path === '/docs') {
      res.writeHead(308, { Location: `${basePath}/docs/` });
      return res.end();
    }
    const file = path.slice('/docs/'.length);
    if (!file) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(docsHtml(prepared.info.name));
    }
    if (file === 'init.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      return res.end(
        `SwaggerUIBundle({ url: ${JSON.stringify(`${basePath}/openapi.json`)}, dom_id: '#swagger-ui', validatorUrl: null, persistAuthorization: true });`,
      );
    }
    const type = swaggerAssets[file];
    if (!type) {
      res.writeHead(404).end();
      return;
    }
    void readFile(join(swaggerAssetDir(), file)).then(
      (data) => {
        res.writeHead(200, {
          'Content-Type': type,
          'Cache-Control': 'max-age=3600',
        });
        res.end(data);
      },
      () => res.writeHead(500).end('Swagger UI asset unavailable'),
    );
  }

  function handle(req: IncomingMessage, res: ServerResponse): boolean {
    let pathname: string;
    try {
      pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    } catch {
      return false;
    }
    if (pathname !== basePath && !pathname.startsWith(`${basePath}/`))
      return false;
    const path = pathname.slice(basePath.length) || '/';
    if (
      req.method === 'GET' &&
      (path === '/openapi.json' ||
        path === '/docs' ||
        path.startsWith('/docs/'))
    ) {
      serveDocs(req, res, path);
      return true;
    }
    const send = (status: number, body: unknown) => {
      if (res.headersSent || res.destroyed) return;
      res.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      });
      res.end(JSON.stringify(body));
    };
    if (token) {
      const supplied = Buffer.from(req.headers.authorization ?? '');
      if (
        supplied.length !== token.length ||
        !timingSafeEqual(supplied, token)
      ) {
        res.setHeader('WWW-Authenticate', 'Bearer');
        send(401, {
          error: 'A valid bearer token is required',
          code: 'UNAUTHORIZED',
        });
        return true;
      }
    }
    route(req, path).then(
      (body) => send(200, body),
      (error) => {
        if (error instanceof HttpError)
          send(error.status, { error: error.message, code: error.code });
        else {
          debug('request failed:', error);
          send(500, {
            error: error instanceof Error ? error.message : String(error),
            code: 'INTERNAL_ERROR',
          });
        }
      },
    );
    return true;
  }

  return { handle, info: prepared.info, close: () => prepared.destroy() };
}

export interface ServeOptions {
  port?: number;
  /** Defaults to 127.0.0.1. A token is required for non-loopback hosts. */
  host?: string;
  token?: string;
  /** Instance options passed to `definition.connect()`. */
  options?: Record<string, unknown>;
}

const loopbackHosts = new Set(['127.0.0.1', 'localhost', '::1']);

/** Validate options, connect the device and start an HTTP server for it. */
export async function serveDevice(
  definition: DeviceDefinition<any>,
  serveOptions: ServeOptions = {},
): Promise<{
  server: Server;
  url: string;
  token?: string;
  close(): Promise<void>;
}> {
  if (!definition || typeof definition.connect !== 'function')
    throw new Error('A device definition must provide connect(options)');
  const instanceOptions = serveOptions.options ?? {};
  if (definition.options) {
    assertParamSchema(definition.options, 'options');
    if (definition.options.type !== 'object')
      throw new Error("Device options must be { type: 'object', ... }");
    validateValue(definition.options, instanceOptions, 'options');
  } else if (Object.keys(instanceOptions).length)
    throw new Error(
      `Device "${definition.name}" does not declare options, got: ${Object.keys(instanceOptions).join(', ')}`,
    );

  const host = serveOptions.host ?? '127.0.0.1';
  const token =
    serveOptions.token ??
    (loopbackHosts.has(host)
      ? undefined
      : randomBytes(18).toString('base64url'));

  const connection = await definition.connect(instanceOptions);
  let prepared: PreparedDevice;
  try {
    prepared = prepareDevice({
      name: definition.name,
      description: definition.description,
      pointerType: definition.pointerType,
      ...connection,
    });
  } catch (error) {
    await connection?.destroy?.();
    throw error;
  }
  const handler = createConnectHandler(prepared, { token });
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (path === '/') {
      res.writeHead(302, { Location: '/api/docs/' }).end();
      return;
    }
    if (!handler.handle(req, res)) res.writeHead(404).end();
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(serveOptions.port ?? DEFAULT_CONNECT_PORT, host, () =>
      resolve(),
    );
  });
  const address = server.address();
  const port =
    typeof address === 'object' && address ? address.port : serveOptions.port;
  const urlHost = host.includes(':') ? `[${host}]` : host;
  let closing: Promise<void> | undefined;
  return {
    server,
    url: `http://${urlHost}:${port}`,
    token,
    close: () => {
      if (!closing) {
        closing = (async () => {
          const closed = new Promise<void>((resolve) =>
            server.close(() => resolve()),
          );
          server.closeAllConnections?.();
          await closed;
          await handler.close();
        })();
      }
      return closing;
    },
  };
}
