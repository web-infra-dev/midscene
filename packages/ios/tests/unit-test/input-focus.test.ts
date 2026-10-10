import { WebDriverRequestError } from '@midscene/webdriver';
import { afterEach, beforeEach, describe, expect, it, rs } from '@rstest/core';
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

  afterEach(() => rs.restoreAllMocks());

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
    request.mockResolvedValue({ value: null });
    await expect(client.waitForInputFocus()).rejects.toThrow(
      'invalid active element',
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
      expect(options.timeout).toBeGreaterThan(0);
      expect(options.timeout).toBeLessThanOrEqual(3000);
    }
  });
});
