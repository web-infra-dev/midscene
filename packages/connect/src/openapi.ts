import type { ConnectInfo } from './device';
import { primitiveByName } from './primitives';
import {
  type ParamSchema,
  isLocateSchema,
  locatedElementSchema,
} from './schema';

/** JSON Schema subset -> OpenAPI schema (locate markers become element objects). */
function toOpenAPISchema(schema: ParamSchema): Record<string, unknown> {
  if (isLocateSchema(schema))
    return {
      ...toOpenAPISchema(locatedElementSchema),
      ...(schema.description ? { description: schema.description } : {}),
    };
  if (schema.type === 'object')
    return {
      type: 'object',
      ...(schema.description ? { description: schema.description } : {}),
      properties: Object.fromEntries(
        Object.entries(schema.properties).map(([k, v]) => [
          k,
          toOpenAPISchema(v),
        ]),
      ),
      ...(schema.required?.length ? { required: schema.required } : {}),
      additionalProperties: false,
    };
  if (schema.type === 'array')
    return { ...schema, items: toOpenAPISchema(schema.items) };
  return { ...schema };
}

const errorResponse = {
  description: 'Error',
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: { error: { type: 'string' }, code: { type: 'string' } },
        required: ['error', 'code'],
      },
    },
  },
};
const json = (schema: Record<string, unknown>, description = 'OK') => ({
  description,
  content: { 'application/json': { schema } },
});

export function buildOpenAPI(
  info: ConnectInfo,
  { basePath, secured }: { basePath: string; secured: boolean },
) {
  const paths: Record<string, unknown> = {
    [`${basePath}/info`]: {
      get: {
        summary: 'Device description, supported primitives and custom actions',
        responses: { 200: json({ type: 'object' }), default: errorResponse },
      },
    },
    [`${basePath}/screenshot`]: {
      get: {
        summary: 'Capture the current screen',
        responses: {
          200: json({
            type: 'object',
            properties: {
              image: {
                type: 'string',
                description: 'data:image/...;base64 URL',
              },
              width: { type: 'number' },
              height: { type: 'number' },
            },
            required: ['image', 'width', 'height'],
          }),
          default: errorResponse,
        },
      },
    },
    [`${basePath}/size`]: {
      get: {
        summary: 'Screen size in screenshot pixels',
        responses: {
          200: json({
            type: 'object',
            properties: {
              width: { type: 'number' },
              height: { type: 'number' },
            },
            required: ['width', 'height'],
          }),
          default: errorResponse,
        },
      },
    },
  };
  const ok = json({
    type: 'object',
    properties: { ok: { type: 'boolean' }, result: {} },
    required: ['ok'],
  });
  for (const name of info.primitives) {
    const spec = primitiveByName.get(name)!;
    paths[`${basePath}/primitives/${name}`] = {
      post: {
        tags: ['primitives'],
        summary: spec.description,
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: toOpenAPISchema(spec.body) },
          },
        },
        responses: { 200: ok, default: errorResponse },
      },
    };
  }
  for (const action of info.actions) {
    paths[`${basePath}/actions/${action.name}`] = {
      post: {
        tags: ['actions'],
        summary: action.description,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: toOpenAPISchema(
                action.params ?? { type: 'object', properties: {} },
              ),
            },
          },
        },
        responses: { 200: ok, default: errorResponse },
      },
    };
  }
  return {
    openapi: '3.1.0',
    info: {
      title: `${info.name} · Midscene Connect`,
      version: info.protocol,
      ...(info.description ? { description: info.description } : {}),
    },
    paths,
    ...(secured
      ? {
          components: {
            securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } },
          },
          security: [{ bearer: [] }],
        }
      : {}),
  };
}
