import { DEFAULT_WDA_PORT } from '@midscene/shared/constants';
import { afterEach, beforeEach, describe, expect, it, rs } from '@rstest/core';
import { IOSWebDriverClient } from '../../src/ios-webdriver-client';

describe('IOSWebDriverClient - WDA 5.x-7.x Compatibility', () => {
  let client: IOSWebDriverClient;

  beforeEach(() => {
    client = new IOSWebDriverClient({
      port: DEFAULT_WDA_PORT,
      host: 'localhost',
    });
    // Mock sessionId to avoid session creation
    (client as any).sessionId = 'test-session-id';
  });

  afterEach(() => {
    rs.restoreAllMocks();
  });

  describe('tap() fallback logic', () => {
    it('should use new endpoint when it succeeds', async () => {
      const makeRequestSpy = rs.spyOn(client as any, 'makeRequest');
      makeRequestSpy.mockResolvedValueOnce({ status: 0 });

      await client.tap(100, 200);

      // Should only call new endpoint once
      expect(makeRequestSpy).toHaveBeenCalledTimes(1);
      expect(makeRequestSpy).toHaveBeenCalledWith(
        'POST',
        '/session/test-session-id/wda/tap',
        { x: 100, y: 200 },
      );
    });

    it('should fallback to legacy endpoint when new endpoint fails', async () => {
      const makeRequestSpy = rs.spyOn(client as any, 'makeRequest');

      // First call (new endpoint) fails
      makeRequestSpy.mockRejectedValueOnce(new Error('New endpoint not found'));
      // Second call (legacy endpoint) succeeds
      makeRequestSpy.mockResolvedValueOnce({ status: 0 });

      await client.tap(100, 200);

      // Should call both endpoints
      expect(makeRequestSpy).toHaveBeenCalledTimes(2);
      expect(makeRequestSpy).toHaveBeenNthCalledWith(
        1,
        'POST',
        '/session/test-session-id/wda/tap',
        { x: 100, y: 200 },
      );
      expect(makeRequestSpy).toHaveBeenNthCalledWith(
        2,
        'POST',
        '/session/test-session-id/wda/tap/0',
        { x: 100, y: 200 },
      );
    });

    it('should throw error when both endpoints fail', async () => {
      const makeRequestSpy = rs.spyOn(client as any, 'makeRequest');

      // Both calls fail
      makeRequestSpy.mockRejectedValueOnce(new Error('New endpoint failed'));
      makeRequestSpy.mockRejectedValueOnce(new Error('Legacy endpoint failed'));

      await expect(client.tap(100, 200)).rejects.toThrow(
        'Failed to tap at coordinates',
      );

      expect(makeRequestSpy).toHaveBeenCalledTimes(2);
    });

    it('should handle different coordinate types', async () => {
      const makeRequestSpy = rs.spyOn(client as any, 'makeRequest');
      makeRequestSpy.mockResolvedValue({ status: 0 });

      await client.tap(0, 0);
      await client.tap(999.5, 888.7);

      expect(makeRequestSpy).toHaveBeenCalledTimes(2);
      expect(makeRequestSpy).toHaveBeenNthCalledWith(
        1,
        'POST',
        '/session/test-session-id/wda/tap',
        { x: 0, y: 0 },
      );
      expect(makeRequestSpy).toHaveBeenNthCalledWith(
        2,
        'POST',
        '/session/test-session-id/wda/tap',
        { x: 999.5, y: 888.7 },
      );
    });
  });

  describe('appSwitcher()', () => {
    it('should use the native WDA drag endpoint with screen coordinates', async () => {
      rs.useFakeTimers();
      const getWindowSizeSpy = rs
        .spyOn(client, 'getWindowSize')
        .mockResolvedValue({ width: 393, height: 852 });
      const makeRequestSpy = rs
        .spyOn(client as any, 'makeRequest')
        .mockResolvedValue({ status: 0 });

      try {
        const appSwitcherPromise = client.appSwitcher();
        await rs.runAllTimersAsync();
        await appSwitcherPromise;

        expect(getWindowSizeSpy).toHaveBeenCalledOnce();
        expect(makeRequestSpy).toHaveBeenCalledOnce();
        expect(makeRequestSpy).toHaveBeenCalledWith(
          'POST',
          '/session/test-session-id/wda/dragfromtoforduration',
          {
            fromX: 197,
            fromY: 851,
            toX: 197,
            toY: 426,
            duration: 1,
          },
        );
      } finally {
        rs.useRealTimers();
      }
    });
  });

  describe('pressKey()', () => {
    it('should reject key combinations before invoking WDA', async () => {
      const makeRequestSpy = rs.spyOn(client as any, 'makeRequest');

      await expect(client.pressKey('Control+A')).rejects.toThrow(
        'iOS keyboardPress does not support key combinations: "Control+A"',
      );
      expect(makeRequestSpy).not.toHaveBeenCalled();
    });
  });

  describe('isKeyboardVisible()', () => {
    it('should query WDA for keyboard elements', async () => {
      const makeRequestSpy = rs
        .spyOn(client as any, 'makeRequest')
        .mockResolvedValue({ value: [{ ELEMENT: 'keyboard-id' }] });

      await expect(client.isKeyboardVisible()).resolves.toBe(true);
      expect(makeRequestSpy).toHaveBeenCalledWith(
        'POST',
        '/session/test-session-id/elements',
        {
          using: 'predicate string',
          value: 'type == "XCUIElementTypeKeyboard" AND visible == true',
        },
      );
    });

    it('should return false when WDA finds no keyboard elements', async () => {
      rs.spyOn(client as any, 'makeRequest').mockResolvedValue({ value: [] });

      await expect(client.isKeyboardVisible()).resolves.toBe(false);
    });

    it('should reject malformed WDA responses', async () => {
      rs.spyOn(client as any, 'makeRequest').mockResolvedValue({
        value: { unexpected: true },
      });

      await expect(client.isKeyboardVisible()).rejects.toThrow(
        'Unexpected WDA elements response',
      );
    });

    it('should reject element entries without an ID', async () => {
      rs.spyOn(client as any, 'makeRequest').mockResolvedValue({
        value: [{ unexpected: true }],
      });

      await expect(client.isKeyboardVisible()).rejects.toThrow(
        'WDA element at index 0 has no element ID',
      );
    });
  });

  describe('dismissKeyboard()', () => {
    it('should locate the accessory toolbar structurally and click its rightmost button', async () => {
      const makeRequestSpy = rs
        .spyOn(client as any, 'makeRequest')
        .mockResolvedValueOnce({
          value: [{ ELEMENT: 'keyboard-id' }],
        })
        .mockResolvedValueOnce({
          value: { x: 0, y: 583, width: 402, height: 233 },
        })
        .mockResolvedValueOnce({
          value: [
            {
              'element-6066-11e4-a52e-4f735466cecf': 'toolbar-id',
            },
          ],
        })
        .mockResolvedValueOnce({
          value: { x: 0, y: 508, width: 402, height: 48 },
        })
        .mockResolvedValueOnce({
          value: [{ ELEMENT: 'previous-id' }, { ELEMENT: 'dismiss-id' }],
        })
        .mockResolvedValueOnce({
          value: { x: 21, y: 513, width: 41, height: 38 },
        })
        .mockResolvedValueOnce({
          value: { x: 341, y: 513, width: 40, height: 38 },
        })
        .mockResolvedValueOnce({ value: null })
        .mockResolvedValueOnce({ value: [] });

      await expect(client.dismissKeyboard()).resolves.toBe(true);
      expect(makeRequestSpy).toHaveBeenNthCalledWith(
        1,
        'POST',
        '/session/test-session-id/elements',
        {
          using: 'predicate string',
          value: 'type == "XCUIElementTypeKeyboard" AND visible == true',
        },
        { timeout: expect.any(Number) },
      );
      expect(makeRequestSpy).toHaveBeenNthCalledWith(
        5,
        'POST',
        '/session/test-session-id/element/toolbar-id/elements',
        {
          using: 'predicate string',
          value:
            'type == "XCUIElementTypeButton" AND enabled == true AND visible == true',
        },
        { timeout: expect.any(Number) },
      );
      expect(makeRequestSpy).toHaveBeenNthCalledWith(
        8,
        'POST',
        '/session/test-session-id/element/dismiss-id/click',
        undefined,
        { timeout: expect.any(Number) },
      );
      for (const call of makeRequestSpy.mock.calls) {
        const timeout = call[3]?.timeout;
        expect(timeout).toBeGreaterThan(0);
        expect(timeout).toBeLessThanOrEqual(5000);
      }
      expect(JSON.stringify(makeRequestSpy.mock.calls)).not.toContain('Done');
      expect(JSON.stringify(makeRequestSpy.mock.calls)).not.toContain('完成');
    });

    it('should not click a custom accessory toolbar without left navigation controls', async () => {
      const makeRequestSpy = rs
        .spyOn(client as any, 'makeRequest')
        .mockResolvedValueOnce({ value: [{ ELEMENT: 'keyboard-id' }] })
        .mockResolvedValueOnce({
          value: { x: 0, y: 583, width: 402, height: 233 },
        })
        .mockResolvedValueOnce({ value: [{ ELEMENT: 'toolbar-id' }] })
        .mockResolvedValueOnce({
          value: { x: 0, y: 508, width: 402, height: 48 },
        })
        .mockResolvedValueOnce({ value: [{ ELEMENT: 'submit-id' }] })
        .mockResolvedValueOnce({
          value: { x: 341, y: 513, width: 40, height: 38 },
        });

      await expect(client.dismissKeyboard()).resolves.toBe(false);
      expect(makeRequestSpy).toHaveBeenCalledTimes(6);
      expect(
        makeRequestSpy.mock.calls.some(([method, endpoint]) =>
          method === 'POST' ? endpoint.endsWith('/click') : false,
        ),
      ).toBe(false);
    });

    it('should return false when no accessory toolbar is next to the keyboard', async () => {
      rs.spyOn(client as any, 'makeRequest')
        .mockResolvedValueOnce({ value: [{ ELEMENT: 'keyboard-id' }] })
        .mockResolvedValueOnce({
          value: { x: 0, y: 583, width: 402, height: 233 },
        })
        .mockResolvedValueOnce({ value: [] });

      await expect(client.dismissKeyboard()).resolves.toBe(false);
    });

    it('should ignore a full-width toolbar that is not next to the keyboard', async () => {
      const makeRequestSpy = rs
        .spyOn(client as any, 'makeRequest')
        .mockResolvedValueOnce({ value: [{ ELEMENT: 'keyboard-id' }] })
        .mockResolvedValueOnce({
          value: { x: 0, y: 583, width: 402, height: 233 },
        })
        .mockResolvedValueOnce({ value: [{ ELEMENT: 'toolbar-id' }] })
        .mockResolvedValueOnce({
          value: { x: 0, y: 100, width: 402, height: 48 },
        });

      await expect(client.dismissKeyboard()).resolves.toBe(false);
      expect(makeRequestSpy).toHaveBeenCalledTimes(4);
    });

    it('should return true when the keyboard is already hidden', async () => {
      rs.spyOn(client as any, 'makeRequest').mockResolvedValue({ value: [] });

      await expect(client.dismissKeyboard()).resolves.toBe(true);
    });

    it('should use names only when the caller explicitly configures them', async () => {
      const makeRequestSpy = rs
        .spyOn(client as any, 'makeRequest')
        .mockResolvedValueOnce({ value: [{ ELEMENT: 'keyboard-id' }] })
        .mockResolvedValueOnce({
          value: { x: 0, y: 583, width: 402, height: 233 },
        })
        .mockResolvedValueOnce({ value: [{ ELEMENT: 'done-button-id' }] })
        .mockResolvedValueOnce({
          value: { x: 341, y: 513, width: 40, height: 38 },
        })
        .mockResolvedValueOnce({ value: null })
        .mockResolvedValueOnce({ value: [] });

      await expect(client.dismissKeyboard(['Done', '完成'])).resolves.toBe(
        true,
      );
      expect(makeRequestSpy).toHaveBeenNthCalledWith(
        3,
        'POST',
        '/session/test-session-id/elements',
        {
          using: 'predicate string',
          value:
            'type IN {"XCUIElementTypeButton", "XCUIElementTypeKey"} AND enabled == true AND visible == true AND (name IN {"Done", "完成"} OR label IN {"Done", "完成"})',
        },
        { timeout: expect.any(Number) },
      );
      expect(makeRequestSpy).toHaveBeenNthCalledWith(
        5,
        'POST',
        '/session/test-session-id/element/done-button-id/click',
        undefined,
        { timeout: expect.any(Number) },
      );
    });

    it('should not click a configured app button far from the keyboard', async () => {
      const makeRequestSpy = rs
        .spyOn(client as any, 'makeRequest')
        .mockResolvedValueOnce({ value: [{ ELEMENT: 'keyboard-id' }] })
        .mockResolvedValueOnce({
          value: { x: 0, y: 583, width: 402, height: 233 },
        })
        .mockResolvedValueOnce({ value: [{ ELEMENT: 'app-done-button-id' }] })
        .mockResolvedValueOnce({
          value: { x: 320, y: 200, width: 60, height: 40 },
        });

      await expect(client.dismissKeyboard(['Done'])).resolves.toBe(false);
      expect(makeRequestSpy).toHaveBeenCalledTimes(4);
    });

    it('should return false when no dismiss button is found', async () => {
      rs.spyOn(client as any, 'makeRequest')
        .mockResolvedValueOnce({ value: [{ ELEMENT: 'keyboard-id' }] })
        .mockResolvedValueOnce({
          value: { x: 0, y: 583, width: 402, height: 233 },
        })
        .mockResolvedValueOnce({ value: [] });

      await expect(client.dismissKeyboard(['Done'])).resolves.toBe(false);
    });

    it('should propagate WDA request errors', async () => {
      rs.spyOn(client as any, 'makeRequest').mockRejectedValue(
        new Error('WDA transport failed'),
      );

      await expect(client.dismissKeyboard()).rejects.toThrow(
        'WDA transport failed',
      );
    });

    it('should reject a visible keyboard without a usable rect', async () => {
      rs.spyOn(client as any, 'makeRequest')
        .mockResolvedValueOnce({ value: [{ ELEMENT: 'keyboard-id' }] })
        .mockResolvedValueOnce({
          value: { x: 0, y: 0, width: 0, height: 0 },
        });

      await expect(client.dismissKeyboard()).rejects.toThrow(
        'WDA reported a visible keyboard without a valid rect',
      );
    });

    it('should return false when the keyboard remains visible after dismissal', async () => {
      rs.useFakeTimers();
      const makeRequestSpy = rs
        .spyOn(client as any, 'makeRequest')
        .mockResolvedValueOnce({ value: [{ ELEMENT: 'keyboard-id' }] })
        .mockResolvedValueOnce({
          value: { x: 0, y: 583, width: 402, height: 233 },
        })
        .mockResolvedValueOnce({
          value: [{ ELEMENT: 'toolbar-id' }],
        })
        .mockResolvedValueOnce({
          value: { x: 0, y: 508, width: 402, height: 48 },
        })
        .mockResolvedValueOnce({
          value: [{ ELEMENT: 'previous-id' }, { ELEMENT: 'dismiss-id' }],
        })
        .mockResolvedValueOnce({
          value: { x: 21, y: 513, width: 41, height: 38 },
        })
        .mockResolvedValueOnce({
          value: { x: 341, y: 513, width: 40, height: 38 },
        })
        .mockResolvedValueOnce({ value: null })
        .mockResolvedValue({ value: [{ ELEMENT: 'keyboard-id' }] });

      try {
        const dismissalPromise = client.dismissKeyboard();
        await rs.advanceTimersByTimeAsync(5100);

        await expect(dismissalPromise).resolves.toBe(false);
        expect(makeRequestSpy.mock.calls.length).toBeGreaterThan(8);
      } finally {
        rs.useRealTimers();
      }
    });
  });

  describe('getScreenScale() fallback logic', () => {
    it('should return scale when endpoint succeeds with scale value', async () => {
      const makeRequestSpy = rs.spyOn(client as any, 'makeRequest');
      makeRequestSpy.mockResolvedValueOnce({
        status: 0,
        value: { scale: 3 },
      });

      const scale = await client.getScreenScale();

      expect(scale).toBe(3);
      expect(makeRequestSpy).toHaveBeenCalledTimes(1);
      expect(makeRequestSpy).toHaveBeenCalledWith(
        'GET',
        '/session/test-session-id/wda/screen',
      );
    });

    it('should enter fallback logic when endpoint succeeds but has no scale', async () => {
      const makeRequestSpy = rs.spyOn(client as any, 'makeRequest');
      const takeScreenshotSpy = rs.spyOn(client, 'takeScreenshot');
      const getWindowSizeSpy = rs.spyOn(client, 'getWindowSize');

      // First call: endpoint succeeds but no scale
      makeRequestSpy.mockResolvedValueOnce({
        status: 0,
        value: {}, // No scale field
      });

      // Mock fallback methods to verify they are called
      const mockBase64 = 'data:image/png;base64,mockdata';
      takeScreenshotSpy.mockResolvedValueOnce(mockBase64);
      getWindowSizeSpy.mockResolvedValueOnce({
        width: 414,
        height: 896,
      });

      // This will fail at jimpFromBase64, but we verify the fallback is entered
      await client.getScreenScale();

      // Verify fallback logic was entered
      expect(takeScreenshotSpy).toHaveBeenCalledTimes(1);
      expect(getWindowSizeSpy).toHaveBeenCalledTimes(1);
    });

    it('should enter fallback logic when endpoint fails', async () => {
      const makeRequestSpy = rs.spyOn(client as any, 'makeRequest');
      const takeScreenshotSpy = rs.spyOn(client, 'takeScreenshot');
      const getWindowSizeSpy = rs.spyOn(client, 'getWindowSize');

      // First call: endpoint fails
      makeRequestSpy.mockRejectedValueOnce(new Error('Endpoint not found'));

      // Mock fallback methods
      const mockBase64 = 'data:image/png;base64,mockdata';
      takeScreenshotSpy.mockResolvedValueOnce(mockBase64);
      getWindowSizeSpy.mockResolvedValueOnce({
        width: 375,
        height: 667,
      });

      // This will fail at jimpFromBase64, but we verify the fallback is entered
      await client.getScreenScale();

      // Verify fallback logic was entered
      expect(takeScreenshotSpy).toHaveBeenCalledTimes(1);
      expect(getWindowSizeSpy).toHaveBeenCalledTimes(1);
    });

    it('should return null when both endpoint and calculation fail', async () => {
      const makeRequestSpy = rs.spyOn(client as any, 'makeRequest');
      const takeScreenshotSpy = rs.spyOn(client, 'takeScreenshot');

      // First call: endpoint fails
      makeRequestSpy.mockRejectedValueOnce(new Error('Endpoint failed'));

      // Fallback: screenshot fails
      takeScreenshotSpy.mockRejectedValueOnce(new Error('Screenshot failed'));

      const scale = await client.getScreenScale();

      expect(scale).toBeNull();
      expect(takeScreenshotSpy).toHaveBeenCalledTimes(1);
    });

    it('should handle response without value field gracefully', async () => {
      const makeRequestSpy = rs.spyOn(client as any, 'makeRequest');
      const takeScreenshotSpy = rs.spyOn(client, 'takeScreenshot');
      const getWindowSizeSpy = rs.spyOn(client, 'getWindowSize');

      // Endpoint returns response without value field
      makeRequestSpy.mockResolvedValueOnce({
        status: 0,
        // No value field at all
      });

      // Mock fallback
      const mockBase64 = 'data:image/png;base64,mockdata';
      takeScreenshotSpy.mockResolvedValueOnce(mockBase64);
      getWindowSizeSpy.mockResolvedValueOnce({
        width: 320,
        height: 568,
      });

      await client.getScreenScale();

      // Verify fallback was triggered
      expect(takeScreenshotSpy).toHaveBeenCalled();
      expect(getWindowSizeSpy).toHaveBeenCalled();
    });

    it('should handle scale value of 0 as invalid and trigger fallback', async () => {
      const makeRequestSpy = rs.spyOn(client as any, 'makeRequest');
      const takeScreenshotSpy = rs.spyOn(client, 'takeScreenshot');
      const getWindowSizeSpy = rs.spyOn(client, 'getWindowSize');

      // Endpoint returns scale: 0 (invalid)
      makeRequestSpy.mockResolvedValueOnce({
        status: 0,
        value: { scale: 0 },
      });

      const mockBase64 = 'data:image/png;base64,mockdata';
      takeScreenshotSpy.mockResolvedValueOnce(mockBase64);
      getWindowSizeSpy.mockResolvedValueOnce({
        width: 320,
        height: 568,
      });

      await client.getScreenScale();

      // scale: 0 should be treated as falsy and trigger fallback
      expect(takeScreenshotSpy).toHaveBeenCalled();
    });
  });

  describe('Compatibility scenarios', () => {
    it('should work with WDA 5.x (legacy tap endpoint)', async () => {
      const makeRequestSpy = rs.spyOn(client as any, 'makeRequest');

      // Simulate WDA 5.x: new endpoint doesn't exist
      makeRequestSpy.mockRejectedValueOnce(
        new Error('404 - Endpoint not found'),
      );
      // Legacy endpoint works
      makeRequestSpy.mockResolvedValueOnce({ status: 0 });

      await client.tap(50, 50);

      expect(makeRequestSpy).toHaveBeenCalledWith(
        'POST',
        '/session/test-session-id/wda/tap/0',
        { x: 50, y: 50 },
      );
    });

    it('should work with WDA 6.x/7.x (new tap endpoint)', async () => {
      const makeRequestSpy = rs.spyOn(client as any, 'makeRequest');

      // Simulate WDA 6.x/7.x: new endpoint works
      makeRequestSpy.mockResolvedValueOnce({ status: 0 });

      await client.tap(50, 50);

      expect(makeRequestSpy).toHaveBeenCalledTimes(1);
      expect(makeRequestSpy).toHaveBeenCalledWith(
        'POST',
        '/session/test-session-id/wda/tap',
        { x: 50, y: 50 },
      );
    });

    it('should handle WDA versions with different screen endpoint responses', async () => {
      const makeRequestSpy = rs.spyOn(client as any, 'makeRequest');

      // Test different scale values
      const testCases = [1, 2, 3, 4];

      for (const expectedScale of testCases) {
        makeRequestSpy.mockResolvedValueOnce({
          status: 0,
          value: { scale: expectedScale },
        });

        const scale = await client.getScreenScale();
        expect(scale).toBe(expectedScale);
      }

      expect(makeRequestSpy).toHaveBeenCalledTimes(testCases.length);
    });
  });
});
