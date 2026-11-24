import { WebDriverRequestError } from '@midscene/webdriver';
import { afterEach, beforeEach, describe, expect, it, rs } from '@rstest/core';
import { IOSAgent } from '../../src/agent';
import { IOSDevice } from '../../src/device';
import { InputFocusUnavailableError } from '../../src/input-focus';
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

  it('recognizes a third-party keyboard with a visible system keyboard switcher', async () => {
    request
      .mockResolvedValueOnce({ value: [] })
      .mockResolvedValueOnce({ value: [{ ELEMENT: 'switcher' }] });
    expect(await client.isKeyboardVisible()).toBe(true);
    expect(request.mock.calls[1][2].value).toContain('下一个键盘');
  });

  it.each(['closed menu', 'paste only', 'unidentified field'] as const)(
    'handles %s through the Agent without a model call to verify clearing',
    async (scenario) => {
      const device = new IOSDevice();
      const agent = new IOSAgent(device, {
        modelConfig: {
          MIDSCENE_MODEL_NAME: 'mock',
          MIDSCENE_MODEL_API_KEY: 'mock',
          MIDSCENE_MODEL_BASE_URL: 'mock',
          MIDSCENE_MODEL_FAMILY: 'doubao-vision',
        },
      });
      const empty = rs.spyOn(agent, 'aiBoolean').mockResolvedValue(false);
      const backend = (device as any).wdaBackend as IOSWebDriverClient;
      (backend as any).sessionId = 'session';
      rs.spyOn(backend, 'waitForInputFocus').mockRejectedValue(
        new InputFocusUnavailableError('no focus'),
      );
      rs.spyOn(backend, 'isKeyboardVisible').mockResolvedValue(true);
      let opened = false;
      const clicks: string[] = [];
      const keys: string[] = [];
      const taps: unknown[] = [];
      rs.spyOn(backend as any, 'makeRequest').mockImplementation(
        async (_method, path, data) => {
          const endpoint = String(path);
          const body = data as { using?: string; value?: string };
          if (endpoint.endsWith('/wda/activeAppInfo'))
            return { value: { bundleId: 'app' } };
          if (endpoint.endsWith('/wda/tap')) taps.push(body);
          else if (endpoint.endsWith('/elements')) {
            let match: string | undefined;
            if (body.using === 'xpath')
              match = scenario === 'unidentified field' ? undefined : 'field';
            else if (opened) match = 'select-all';
            else if (
              scenario === 'paste only' &&
              !body.value?.includes('Select All')
            )
              match = 'paste';
            return { value: match ? [{ ELEMENT: match }] : [] };
          } else if (endpoint.endsWith('/click')) {
            clicks.push(endpoint);
            if (endpoint.endsWith('/field/click')) opened = true;
          } else if (endpoint.endsWith('/wda/keys'))
            keys.push(...(data as { value: string[] }).value);
          else throw new Error(`Unexpected WDA request: ${endpoint}`);
          return { value: null };
        },
      );
      await device.inputPrimitives.keyboard.typeText('new', {
        target: { center: [10, 20] },
        replace: true,
        autoDismissKeyboard: false,
      });
      if (scenario === 'closed menu') {
        expect(clicks).toEqual([
          '/session/session/element/field/click',
          '/session/session/element/select-all/click',
        ]);
        expect(keys.join('')).toBe('new');
      } else {
        expect(clicks).toEqual([]);
        expect(keys).toEqual(['\b'.repeat(50), 'n', 'e', 'w']);
      }
      expect(empty).not.toHaveBeenCalled();
      expect(taps).toEqual([{ x: 10, y: 20 }]);
    },
  );

  it('bounds slow menu polls and stops when the remaining request time expires', async () => {
    rs.useFakeTimers();
    try {
      request
        .mockResolvedValueOnce({ value: [] }) // Menu closed
        .mockResolvedValueOnce({ value: null }) // Open menu
        .mockResolvedValueOnce({ value: [] }) // First poll
        .mockImplementationOnce(async (_method, _path, _body, { timeout }) => {
          expect(timeout).toBe(1100);
          await new Promise((resolve) => setTimeout(resolve, timeout));
          throw new WebDriverRequestError(`Request timeout after ${timeout}ms`);
        });
      const selected = client.selectAllFromMenu('field');
      await rs.advanceTimersByTimeAsync(1200);
      expect(await selected).toBe(false);
      expect(request).toHaveBeenCalledTimes(4);
    } finally {
      rs.useRealTimers();
    }
  });

  it('caps the last poll delay without starting another lookup after the deadline', async () => {
    rs.useFakeTimers();
    try {
      request
        .mockResolvedValueOnce({ value: [] })
        .mockResolvedValueOnce({ value: null })
        .mockImplementationOnce(async () => {
          await new Promise((resolve) => setTimeout(resolve, 1170));
          return { value: [] };
        });
      const selected = client.selectAllFromMenu('field');
      await rs.advanceTimersByTimeAsync(1200);
      expect(await selected).toBe(false);
      expect(request).toHaveBeenCalledTimes(3);
    } finally {
      rs.useRealTimers();
    }
  });

  it('uses the remaining lookup budget for Select All after a slow opening gesture', async () => {
    let now = 0;
    rs.spyOn(Date, 'now').mockImplementation(() => now);
    request
      .mockImplementationOnce(async () => {
        now += 250;
        return { value: [] };
      })
      .mockImplementationOnce(async () => {
        now += 2000;
        return { value: null };
      })
      .mockImplementationOnce(async () => {
        now += 450;
        return { value: [{ ELEMENT: 'menu' }] };
      })
      .mockResolvedValueOnce({ value: [{ ELEMENT: 'select-all' }] })
      .mockResolvedValueOnce({ value: null });
    expect(await client.selectAllFromMenu('field')).toBe(true);
    expect(request.mock.calls.map((call) => call[3]?.timeout)).toEqual([
      1200,
      undefined,
      950,
      500,
      undefined,
    ]);
  });

  it('propagates a WDA failure during menu discovery', async () => {
    const failure = new WebDriverRequestError('invalid session', 404);
    request.mockRejectedValueOnce(failure);
    await expect(client.selectAllFromMenu()).rejects.toBe(failure);
  });

  it('does not reopen a field when the original tap overlaps multiple inputs', async () => {
    request.mockResolvedValueOnce({
      value: [{ ELEMENT: 'first' }, { ELEMENT: 'second' }],
    });
    expect(await client.findInputAt(10, 20)).toBeUndefined();
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
    '',
    'no such element',
    JSON.stringify({ value: { error: 'no such element' } }),
    { error: 'no such element' },
  ])('polls an active-element 404 returned by a gateway (%j)', async (body) => {
    request
      .mockRejectedValueOnce(new WebDriverRequestError('HTTP 404', 404, body))
      .mockResolvedValue({ value: { ELEMENT: 'field' } });
    await client.waitForInputFocus();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it.each([
    new WebDriverRequestError('Connection lost'),
    new WebDriverRequestError(
      'Session gone',
      404,
      JSON.stringify({ value: { error: 'invalid session id' } }),
    ),
    new WebDriverRequestError(
      'Unrecognized response',
      404,
      '<html>Not found</html>',
    ),
    new WebDriverRequestError('Request timeout after 3000ms'),
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

  it('classifies a final request timeout only after WDA reported missing focus', async () => {
    let now = 0;
    rs.spyOn(Date, 'now').mockImplementation(() => now);
    request
      .mockRejectedValueOnce(noFocus())
      .mockImplementationOnce(async () => {
        now = 3000;
        throw new WebDriverRequestError('Request timeout after 59ms');
      });
    await expect(client.waitForInputFocus()).rejects.toBeInstanceOf(
      InputFocusUnavailableError,
    );
    expect(request).toHaveBeenCalledTimes(2);
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
