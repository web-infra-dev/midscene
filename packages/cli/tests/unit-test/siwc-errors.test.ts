import { describe, expect, it } from '@rstest/core';
import {
  describeSiwcError,
  tokenResponseError,
  withSiwcStage,
} from '../../src/openai/errors';

describe('SIWC diagnostics', () => {
  it('prints the complete error response, including unknown codes and non-JSON bodies', async () => {
    for (const body of [
      JSON.stringify({
        error: 'custom_error',
        error_description: 'refresh_token=secret',
      }),
      '<html>upstream unavailable</html>',
    ]) {
      const output = describeSiwcError(
        await tokenResponseError(new Response(body, { status: 400 })),
      );
      expect(output).toContain('HTTP status: 400');
      expect(output).toContain(body);
    }
  });

  it('preserves the original error and nested causes with the failure stage', async () => {
    const error = Object.assign(new Error('token=secret'), {
      cause: new AggregateError([
        Object.assign(new Error('connection failed'), {
          code: 'CUSTOM_NETWORK_ERROR',
        }),
      ]),
    });
    const failure = await withSiwcStage('Token exchange', async () => {
      throw error;
    }).catch((error) => error);
    expect(failure.cause).toBe(error);
    const output = describeSiwcError(failure);
    expect(output).toContain('Stage: Token exchange');
    expect(output).toContain('token=secret');
    expect(output).toContain('connection failed');
    expect(output).toContain('CUSTOM_NETWORK_ERROR');
  });

  it('handles thrown objects and circular references without filtering fields', () => {
    const error: Record<string, unknown> = {
      detail: 'diagnostic text',
      token: 'test-token',
    };
    error.cause = error;
    expect(describeSiwcError(error)).toContain('test-token');
    expect(describeSiwcError(error)).toContain('Circular');
  });

  it('keeps the HTTP status and original error if reading the response fails', async () => {
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.error(new Error('body read failed'));
        },
      }),
      { status: 502 },
    );
    const output = describeSiwcError(await tokenResponseError(response));
    expect(output).toContain('HTTP status: 502');
    expect(output).toContain('body read failed');
  });
});
