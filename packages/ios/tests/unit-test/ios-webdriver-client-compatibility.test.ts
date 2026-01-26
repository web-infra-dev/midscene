import { DEFAULT_WDA_PORT } from '@midscene/shared/constants';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
    vi.restoreAllMocks();
  });

  describe('tap() fallback logic', () => {
    it('should use new endpoint when it succeeds', async () => {
      const makeRequestSpy = vi.spyOn(client as any, 'makeRequest');
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
      const makeRequestSpy = vi.spyOn(client as any, 'makeRequest');

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
      const makeRequestSpy = vi.spyOn(client as any, 'makeRequest');

      // Both calls fail
      makeRequestSpy.mockRejectedValueOnce(new Error('New endpoint failed'));
      makeRequestSpy.mockRejectedValueOnce(new Error('Legacy endpoint failed'));

      await expect(client.tap(100, 200)).rejects.toThrow(
        'Failed to tap at coordinates',
      );

      expect(makeRequestSpy).toHaveBeenCalledTimes(2);
    });

    it('should handle different coordinate types', async () => {
      const makeRequestSpy = vi.spyOn(client as any, 'makeRequest');
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

  describe('getScreenScale() fallback logic', () => {
    it('should return scale when endpoint succeeds with scale value', async () => {
      const makeRequestSpy = vi.spyOn(client as any, 'makeRequest');
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
      const makeRequestSpy = vi.spyOn(client as any, 'makeRequest');
      const takeScreenshotSpy = vi.spyOn(client, 'takeScreenshot');
      const getWindowSizeSpy = vi.spyOn(client, 'getWindowSize');

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
      const makeRequestSpy = vi.spyOn(client as any, 'makeRequest');
      const takeScreenshotSpy = vi.spyOn(client, 'takeScreenshot');
      const getWindowSizeSpy = vi.spyOn(client, 'getWindowSize');

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
      const makeRequestSpy = vi.spyOn(client as any, 'makeRequest');
      const takeScreenshotSpy = vi.spyOn(client, 'takeScreenshot');

      // First call: endpoint fails
      makeRequestSpy.mockRejectedValueOnce(new Error('Endpoint failed'));

      // Fallback: screenshot fails
      takeScreenshotSpy.mockRejectedValueOnce(new Error('Screenshot failed'));

      const scale = await client.getScreenScale();

      expect(scale).toBeNull();
      expect(takeScreenshotSpy).toHaveBeenCalledTimes(1);
    });

    it('should handle response without value field gracefully', async () => {
      const makeRequestSpy = vi.spyOn(client as any, 'makeRequest');
      const takeScreenshotSpy = vi.spyOn(client, 'takeScreenshot');
      const getWindowSizeSpy = vi.spyOn(client, 'getWindowSize');

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
      const makeRequestSpy = vi.spyOn(client as any, 'makeRequest');
      const takeScreenshotSpy = vi.spyOn(client, 'takeScreenshot');
      const getWindowSizeSpy = vi.spyOn(client, 'getWindowSize');

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

  describe('getTimestamp()', () => {
    it('should return timestamp when appium endpoint succeeds', async () => {
      const makeRequestSpy = vi.spyOn(client as any, 'makeRequest');
      const mockTimeString = '2024-01-26T15:30:45+08:00';
      makeRequestSpy.mockResolvedValueOnce({ value: mockTimeString });

      const result = await client.getTimestamp();

      expect(makeRequestSpy).toHaveBeenCalledTimes(1);
      expect(makeRequestSpy).toHaveBeenCalledWith(
        'GET',
        '/session/test-session-id/appium/device/system_time',
      );
      expect(result).toBe(new Date(mockTimeString).getTime());
    });

    it('should fallback to execute method when appium endpoint fails', async () => {
      const makeRequestSpy = vi.spyOn(client as any, 'makeRequest');
      const mockTimeString = '2024-01-26T15:30:45+08:00';

      // First call (appium endpoint) fails
      makeRequestSpy.mockRejectedValueOnce(new Error('Endpoint not found'));
      // Second call (execute method) succeeds
      makeRequestSpy.mockResolvedValueOnce({ value: mockTimeString });

      const result = await client.getTimestamp();

      expect(makeRequestSpy).toHaveBeenCalledTimes(2);
      expect(makeRequestSpy).toHaveBeenNthCalledWith(
        1,
        'GET',
        '/session/test-session-id/appium/device/system_time',
      );
      expect(makeRequestSpy).toHaveBeenNthCalledWith(
        2,
        'POST',
        '/session/test-session-id/execute',
        {
          script: 'mobile: getDeviceTime',
          args: [{ format: 'YYYY-MM-DDTHH:mm:ssZ' }],
        },
      );
      expect(result).toBe(new Date(mockTimeString).getTime());
    });

    it('should throw error when both endpoints fail', async () => {
      const makeRequestSpy = vi.spyOn(client as any, 'makeRequest');

      makeRequestSpy.mockRejectedValueOnce(new Error('Appium endpoint failed'));
      makeRequestSpy.mockRejectedValueOnce(new Error('Execute method failed'));

      await expect(client.getTimestamp()).rejects.toThrow(
        'Failed to get device time',
      );

      expect(makeRequestSpy).toHaveBeenCalledTimes(2);
    });

    it('should throw error for invalid time format from appium endpoint', async () => {
      const makeRequestSpy = vi.spyOn(client as any, 'makeRequest');
      makeRequestSpy.mockResolvedValueOnce({ value: 'invalid-time-string' });

      await expect(client.getTimestamp()).rejects.toThrow(
        'Invalid time format received',
      );
    });

    it('should handle response without value wrapper', async () => {
      const makeRequestSpy = vi.spyOn(client as any, 'makeRequest');
      const mockTimeString = '2024-01-26T15:30:45+08:00';
      makeRequestSpy.mockResolvedValueOnce(mockTimeString);

      const result = await client.getTimestamp();

      expect(result).toBe(new Date(mockTimeString).getTime());
    });

    it('should use custom format when provided', async () => {
      const makeRequestSpy = vi.spyOn(client as any, 'makeRequest');

      // First call fails to trigger fallback with custom format
      makeRequestSpy.mockRejectedValueOnce(new Error('Endpoint not found'));
      makeRequestSpy.mockResolvedValueOnce({ value: '2024-01-26' });

      await client.getTimestamp('YYYY-MM-DD');

      expect(makeRequestSpy).toHaveBeenNthCalledWith(
        2,
        'POST',
        '/session/test-session-id/execute',
        {
          script: 'mobile: getDeviceTime',
          args: [{ format: 'YYYY-MM-DD' }],
        },
      );
    });
  });

  describe('Compatibility scenarios', () => {
    it('should work with WDA 5.x (legacy tap endpoint)', async () => {
      const makeRequestSpy = vi.spyOn(client as any, 'makeRequest');

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
      const makeRequestSpy = vi.spyOn(client as any, 'makeRequest');

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
      const makeRequestSpy = vi.spyOn(client as any, 'makeRequest');

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
