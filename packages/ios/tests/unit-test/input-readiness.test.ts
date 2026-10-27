import {
  WebDriverRequestError,
  WebDriverRequestTimeoutError,
} from '@midscene/webdriver';
import { afterEach, beforeEach, describe, expect, it, rs } from '@rstest/core';
import { InputFocusTimeoutError } from '../../src/input-focus';
import { IOSWebDriverClient } from '../../src/ios-webdriver-client';

const noFocus = () =>
  new WebDriverRequestError('No active element', 404, {
    value: { error: 'no such element' },
  });

describe('iOS input focus readiness', () => {
  let client: IOSWebDriverClient;
  let request: ReturnType<typeof rs.spyOn>;

  beforeEach(() => {
    client = new IOSWebDriverClient({ host: 'localhost', port: 8100 });
    (client as any).sessionId = 'session';
    request = rs.spyOn(client as any, 'makeRequest');
  });

  afterEach(() => {
    rs.restoreAllMocks();
  });

  it.each([
    { value: { 'element-6066-11e4-a52e-4f735466cecf': 'input' } },
    { value: { ELEMENT: 'input' } },
  ])(
    'continues immediately when an input already has focus',
    async (response) => {
      request.mockResolvedValue(response);
      await client.waitForInputFocus();
      expect(request).toHaveBeenCalledTimes(1);
      expect(request).toHaveBeenCalledWith(
        'GET',
        '/session/session/element/active',
        undefined,
        { timeout: expect.any(Number) },
      );
    },
  );

  it('polls missing focus during a modal transition without sending keys', async () => {
    request
      .mockRejectedValueOnce(noFocus())
      .mockResolvedValue({ value: { ELEMENT: 'search' } });
    await client.waitForInputFocus();
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls.every(([method]) => method === 'GET')).toBe(true);
  });

  it.each([
    new WebDriverRequestError('Connection lost'),
    new WebDriverRequestError('Unsupported', 404, {
      value: { error: 'unknown command' },
    }),
    new WebDriverRequestError('Session gone', 404, {
      value: { error: 'invalid session id' },
    }),
  ])('propagates errors other than missing focus', async (error) => {
    request.mockRejectedValue(error);
    await expect(client.waitForInputFocus()).rejects.toThrow(error);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed success responses instead of typing blindly', async () => {
    request.mockResolvedValue({ value: {} });
    await expect(client.waitForInputFocus()).rejects.toThrow(
      'Missing WDA input element ID',
    );
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('bounds the wait and every request timeout', async () => {
    let now = 0;
    rs.spyOn(Date, 'now').mockImplementation(() => {
      now += 500;
      return now;
    });
    request.mockRejectedValue(noFocus());
    await expect(client.waitForInputFocus()).rejects.toBeInstanceOf(
      InputFocusTimeoutError,
    );
    expect(request.mock.calls.length).toBeGreaterThan(0);
    for (const [method, , , options] of request.mock.calls) {
      expect(method).toBe('GET');
      if (
        typeof options !== 'object' ||
        options === null ||
        !('timeout' in options)
      ) {
        throw new Error('Focus requests must include a timeout');
      }
      expect(options.timeout).toBeGreaterThan(0);
      expect(options.timeout).toBeLessThanOrEqual(3000);
    }
  });

  it('accepts focus observed at the deadline without triggering recovery', async () => {
    let now = 0;
    rs.spyOn(Date, 'now').mockImplementation(() => now);
    request.mockImplementation(async () => {
      now = 3000;
      return { value: { ELEMENT: 'input' } };
    });
    await client.waitForInputFocus();
    expect(request).toHaveBeenCalledOnce();
  });

  it('reports focus timeout when the last request exhausts its budget', async () => {
    let now = 0;
    rs.spyOn(Date, 'now').mockImplementation(() => now);
    const cause = new WebDriverRequestTimeoutError(3000);
    request.mockImplementation(async () => {
      now = 3000;
      throw cause;
    });
    await expect(client.waitForInputFocus()).rejects.toMatchObject({
      name: 'InputFocusTimeoutError',
      message: expect.stringContaining(
        'Timed out waiting for iOS input focus after 3000ms',
      ),
      cause,
    });
    expect(request).toHaveBeenCalledOnce();
  });

  it.each([
    [new WebDriverRequestTimeoutError(25), 25],
    [new WebDriverRequestError('Connection lost'), 3000],
    [
      new WebDriverRequestError('Session gone', 404, {
        value: { error: 'invalid session id' },
      }),
      3000,
    ],
  ] as const)(
    'preserves errors that are not the focus deadline: %s',
    async (error, elapsed) => {
      let now = 0;
      rs.spyOn(Date, 'now').mockImplementation(() => now);
      request.mockImplementation(async () => {
        now = elapsed;
        throw error;
      });
      await expect(client.waitForInputFocus()).rejects.toBe(error);
      expect(request).toHaveBeenCalledOnce();
    },
  );
  it('accepts a visible keyboard when the responder is inaccessible', async () => {
    request
      .mockRejectedValueOnce(noFocus())
      .mockResolvedValueOnce({ value: [{ ELEMENT: 'keyboard' }] });
    await client.waitForKeyboardReady();
    expect(request).toHaveBeenLastCalledWith(
      'POST',
      '/session/session/elements',
      {
        using: 'predicate string',
        value: 'type == "XCUIElementTypeKeyboard" AND visible == 1',
      },
      { timeout: expect.any(Number) },
    );
  });

  it('accepts an active element without querying a software keyboard', async () => {
    request.mockResolvedValueOnce({
      value: { ELEMENT: 'hardware-keyboard-input' },
    });
    await client.waitForKeyboardReady();
    expect(request).toHaveBeenCalledOnce();
  });

  it('never uses a keyboard as a substitute for a clear target', async () => {
    let now = 0;
    rs.spyOn(Date, 'now').mockImplementation(() => now);
    request.mockImplementation(async () => {
      now = 3000;
      throw noFocus();
    });
    await expect(client.waitForInputFocus()).rejects.toThrow(
      'refusing to clear an unknown target',
    );
    expect(request).toHaveBeenCalledOnce();
  });

  it('waits for a delayed keyboard instead of re-tapping', async () => {
    request
      .mockRejectedValueOnce(noFocus())
      .mockResolvedValueOnce({ value: [] })
      .mockRejectedValueOnce(noFocus())
      .mockResolvedValueOnce({ value: [{ ELEMENT: 'keyboard' }] });
    await client.waitForKeyboardReady();
    expect(request).toHaveBeenCalledTimes(4);
    expect(
      request.mock.calls.every(
        ([, path]) =>
          path.endsWith('/element/active') || path.endsWith('/elements'),
      ),
    ).toBe(true);
  });

  it('bounds keyboard discovery by the remaining readiness budget', async () => {
    let now = 0;
    rs.spyOn(Date, 'now').mockImplementation(() => now);
    const cause = new WebDriverRequestTimeoutError(2500);
    request
      .mockImplementationOnce(async () => {
        now = 500;
        throw noFocus();
      })
      .mockImplementationOnce(async () => {
        now = 3000;
        throw cause;
      });
    await expect(client.waitForKeyboardReady()).rejects.toMatchObject({
      message: 'Timed out waiting for iOS keyboard readiness after 3000ms',
      cause,
    });
    expect(request.mock.calls[1][3]).toEqual({ timeout: 2500 });
  });

  it('does not accept missing focus and an absent keyboard', async () => {
    let now = 0;
    rs.spyOn(Date, 'now').mockImplementation(() => now);
    request
      .mockRejectedValueOnce(noFocus())
      .mockImplementationOnce(async () => {
        now = 3000;
        return { value: [] };
      });
    await expect(client.waitForKeyboardReady()).rejects.toThrow(
      'keyboard readiness',
    );
  });

  it.each([{ value: null }, { value: [{}] }])(
    'rejects malformed keyboard responses',
    async (response) => {
      request.mockRejectedValueOnce(noFocus()).mockResolvedValueOnce(response);
      await expect(client.waitForKeyboardReady()).rejects.toThrow();
    },
  );

  it('does not hide session errors behind keyboard discovery', async () => {
    const error = new WebDriverRequestError('Session gone', 404, {
      value: { error: 'invalid session id' },
    });
    request.mockRejectedValueOnce(error);
    await expect(client.waitForKeyboardReady()).rejects.toBe(error);
    expect(request).toHaveBeenCalledOnce();
  });
});
