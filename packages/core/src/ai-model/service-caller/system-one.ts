import type { IModelConfig } from '@midscene/shared/env';
import { assert, uuid } from '@midscene/shared/utils';
import { z } from 'zod';
import { createProxyAgentIfNeeded } from './proxy';
import type { ModelCallContext, ModelCallResult } from './types';

export interface SystemOneRequest {
  state: Record<string, unknown>;
  images?: Record<string, string>;
  questions: Record<
    string,
    | { type: 'noul' | 'box'; instructions: unknown }
    | {
        type: 'choice';
        instructions: unknown;
        criteria: Record<string, string>;
      }
  >;
}

const probability = z.number().min(0).max(1);
export const systemOneAnswerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('noul'), noul: probability }),
  z.object({ type: z.literal('choice'), choice: z.string() }),
  z.object({
    type: z.literal('box'),
    box: z
      .object({
        left: probability,
        right: probability,
        top: probability,
        bottom: probability,
      })
      .refine(
        (box) => box.left < box.right && box.top < box.bottom,
        'Invalid box edges',
      ),
  }),
]);
export const systemOneResponseSchema = z.object({
  model: z.string().optional(),
  answers: z.record(systemOneAnswerSchema),
  usage: z
    .object({
      input_tokens: z.number().nonnegative().nullable().optional(),
      output_tokens: z.number().nonnegative().nullable().optional(),
    })
    .optional(),
});

export async function prepareSystemOne(
  config: IModelConfig,
  request: SystemOneRequest,
) {
  assert(config.openaiBaseURL, 'Jev requires MIDSCENE_*_MODEL_BASE_URL');
  assert(config.openaiApiKey, 'Jev requires MIDSCENE_*_MODEL_API_KEY');
  assert(
    !config.protocol || config.protocol === 'openai-chat',
    'Jev uses System One, not the Responses API',
  );
  const base = config.openaiBaseURL.replace(/\/+$/, '');
  const url = `${base}${base.endsWith('/v1') ? '' : '/v1'}/systemone`;
  const isOpenRouter = new URL(base).hostname === 'openrouter.ai';
  const assets: Record<string, unknown> = {};
  const imageState = Object.fromEntries(
    Object.entries(request.images ?? {}).map(([name, dataURL]) => {
      if (isOpenRouter) {
        return [name, { type: 'image_url', image_url: { url: dataURL } }];
      }
      const reference = uuid();
      const match = /^data:image\/(png|jpeg);base64,(.+)$/.exec(dataURL);
      assert(match, 'System One images must be prepared PNG or JPEG data URLs');
      assets[reference] = {
        type: 'image',
        format: match[1] === 'png' ? 'png' : 'jpg',
        data_base64: match[2],
      };
      return [name, reference];
    }),
  );
  const body = {
    ...config.extraBody,
    model: config.modelName,
    state: { ...request.state, ...imageState },
    questions: request.questions,
    ...(!isOpenRouter && Object.keys(assets).length ? { assets } : {}),
  };
  const serializedBody = JSON.stringify(body);
  assert(
    new TextEncoder().encode(serializedBody).length <= 32 * 1024 * 1024,
    'Jev request exceeds the 32 MiB body limit',
  );
  return {
    url,
    body: serializedBody,
    questions: request.questions,
    headers: {
      ...(config.openaiExtraConfig?.defaultHeaders as
        | Record<string, string>
        | undefined),
      Authorization: `Bearer ${config.openaiApiKey}`,
      'Content-Type': 'application/json',
      'TypeSafe-Danger-Zone-Images': 'true',
    },
    dispatcher: await createProxyAgentIfNeeded({
      socksProxy: config.socksProxy,
      httpProxy: config.httpProxy,
    }),
  };
}

export async function callSystemOne(
  context: ModelCallContext,
  prepared: Awaited<ReturnType<typeof prepareSystemOne>>,
): Promise<ModelCallResult> {
  assert(!context.options?.stream, 'Jev does not support streaming output');
  const start = Date.now();
  context.recordEvent?.({
    type: 'request',
    request: { url: prepared.url, method: 'POST', body: prepared.body },
  });
  try {
    const response = await fetch(prepared.url, {
      method: 'POST',
      headers: prepared.headers,
      body: prepared.body,
      signal: context.requestSignal,
      ...(prepared.dispatcher ? { dispatcher: prepared.dispatcher } : {}),
    });
    const body = await response.text();
    const http = { status: response.status, ok: response.ok, body };
    if (!response.ok) {
      context.recordEvent?.({ type: 'error', http });
      throw new Error(
        `Jev request failed (${response.status}): ${body.slice(0, 4000)}`,
      );
    }
    const result = systemOneResponseSchema.parse(JSON.parse(body));
    for (const [name, question] of Object.entries(prepared.questions)) {
      assert(
        result.answers[name]?.type === question.type,
        `Missing or invalid Jev answer: ${name}`,
      );
    }
    for (const [name, question] of Object.entries(prepared.questions)) {
      const answer = result.answers[name];
      if (question.type === 'choice' && answer.type === 'choice') {
        assert(
          Object.hasOwn(question.criteria, answer.choice),
          `Invalid Jev choice: ${name}`,
        );
      }
    }
    const input = result.usage?.input_tokens;
    const output = result.usage?.output_tokens;
    const final: ModelCallResult = {
      content: body,
      isStreamed: false,
      rawUsage:
        input != null && output != null
          ? {
              prompt_tokens: input,
              completion_tokens: output,
              total_tokens: input + output,
            }
          : undefined,
      timeCost: Date.now() - start,
      requestId: response.headers.get('x-request-id'),
      responseModelName: result.model,
    };
    context.recordEvent?.({ type: 'response', http, final });
    return final;
  } catch (error) {
    context.recordEvent?.({
      type: 'error',
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
