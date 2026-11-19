import { WebDriverRequestError } from '@midscene/webdriver';
import { afterEach, beforeEach, describe, expect, it, rs } from '@rstest/core';
import { IOSDevice } from '../../src/device';
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
    await expect(
      client.waitForInputFocus({ allowVisibleKeyboard: true }),
    ).rejects.toThrow(error);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed success responses instead of typing blindly', async () => {
    request.mockResolvedValue({ value: {} });
    await expect(
      client.waitForInputFocus({ allowVisibleKeyboard: true }),
    ).rejects.toThrow('Missing WDA input element ID');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('bounds the keyboard query by the remaining focus wait and rejects a late result', async () => {
    const clock = rs.spyOn(Date, 'now').mockReturnValue(0);
    request
      .mockImplementationOnce(async () => {
        clock.mockReturnValue(1000);
        throw noFocus();
      })
      .mockImplementationOnce(async () => {
        clock.mockReturnValue(3000);
        return { value: [{ ELEMENT: 'keyboard' }] };
      });
    await expect(
      client.waitForInputFocus({ allowVisibleKeyboard: true }),
    ).rejects.toThrow('3000ms');
    expect(request.mock.calls[1][3]).toEqual({ timeout: 2000 });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('bounds the wait and every request timeout', async () => {
    let now = 0;
    rs.spyOn(Date, 'now').mockImplementation(() => {
      now += 500;
      return now;
    });
    request.mockRejectedValue(noFocus());
    await expect(client.waitForInputFocus()).rejects.toThrow('3000ms');
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
});

it('sends located typeOnly input when WDA exposes a keyboard but no active element', async () => {
  const device = new IOSDevice({
    sessionId: 'session',
    autoDismissKeyboard: false,
  });
  const input = device.actionSpace().find((action) => action.name === 'Input')!;
  let keyboardQueries = 0;
  const fetch = rs
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (url) => {
      switch (new URL(String(url)).pathname) {
        case '/session/session/element/active':
          return Response.json(
            { value: { error: 'no such element' } },
            { status: 404 },
          );
        case '/session/session/elements':
          keyboardQueries++;
          return Response.json({
            value: keyboardQueries === 1 ? [] : [{ ELEMENT: 'keyboard' }],
          });
        case '/session/session/wda/tap':
        case '/session/session/wda/keys':
          return Response.json({ value: null });
        default:
          throw new Error(`Unexpected WDA request: ${url}`);
      }
    });
  try {
    await input.call({
      locate: { center: [10, 20] },
      mode: 'typeOnly',
      value: 'test',
    });
    expect(
      fetch.mock.calls.map(([url, init]) => [
        init?.method,
        new URL(String(url)).pathname,
      ]),
    ).toEqual([
      ['POST', '/session/session/wda/tap'],
      ['GET', '/session/session/element/active'],
      ['POST', '/session/session/elements'],
      ['GET', '/session/session/element/active'],
      ['POST', '/session/session/elements'],
      ['POST', '/session/session/wda/keys'],
    ]);
    expect(JSON.parse(String(fetch.mock.calls[2][1]?.body))).toEqual({
      using: 'predicate string',
      value: 'type == "XCUIElementTypeKeyboard" AND visible == true',
    });
    expect(JSON.parse(String(fetch.mock.calls[5][1]?.body))).toEqual({
      value: ['t', 'e', 's', 't'],
    });
  } finally {
    fetch.mockRestore();
  }
});
