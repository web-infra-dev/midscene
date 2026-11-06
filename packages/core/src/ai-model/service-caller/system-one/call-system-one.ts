import { assert } from '@midscene/shared/utils';
import type { ModelCallContext, ModelCallResult } from '../types';
import type { prepareSystemOne } from './prepare-system-one';
import { systemOneResponseSchema } from './schema';

export async function callSystemOne(
  context: ModelCallContext,
  prepared: Awaited<ReturnType<typeof prepareSystemOne>>,
): Promise<ModelCallResult> {
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
    context.recordEvent?.({ type: 'http-response', http });
    if (!response.ok) {
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
      // TypeSafe and OpenRouter use different ID field names; defer compatibility handling.
      requestId: undefined,
      responseModelName: result.model,
    };
    context.recordEvent?.({ type: 'response', final });
    return final;
  } catch (error) {
    context.recordEvent?.({
      type: 'error',
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
