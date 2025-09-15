import type { DeviceAction } from '@midscene/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RemoteExecutionAdapter } from '../../src/adapters/remote-execution';
import type { ExecutionOptions, FormValue } from '../../src/types';

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock PLAYGROUND_SERVER_PORT
vi.mock('@midscene/shared/constants', () => ({
  PLAYGROUND_SERVER_PORT: 3000,
}));

describe('RemoteExecutionAdapter', () => {
  let adapter: RemoteExecutionAdapter;
  const mockServerUrl = 'http://localhost:3000';

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new RemoteExecutionAdapter(mockServerUrl);

    // Mock window object to simulate browser environment
    Object.defineProperty(global, 'window', {
      value: {},
      writable: true,
    });
  });

  describe('constructor', () => {
    it('should use default port when no serverUrl provided', () => {
      const defaultAdapter = new RemoteExecutionAdapter();
      expect(defaultAdapter).toBeDefined();
    });

    it('should use provided serverUrl', () => {
      const customAdapter = new RemoteExecutionAdapter('http://custom:4000');
      expect(customAdapter).toBeDefined();
    });
  });

  describe('parseStructuredParams', () => {
    it('should return prompt and options when no valid schema', async () => {
      const action: DeviceAction<unknown> = {
        name: 'test',
        description: 'Test action',
        call: vi.fn(),
      };
      const params = { prompt: 'test prompt' };
      const options: ExecutionOptions = { deepThink: true };

      const result = await adapter.parseStructuredParams(
        action,
        params,
        options,
      );

      expect(result).toEqual(['test prompt', options]);
    });

    it('should merge options and valid params for valid schema', async () => {
      const action: DeviceAction<unknown> = {
        name: 'test',
        description: 'Test action',
        paramSchema: { shape: { field: {} } } as any,
        call: vi.fn(),
      };
      const params = {
        field: 'value',
        empty: '',
        prompt: 'test prompt',
      };
      const options: ExecutionOptions = { deepThink: true };

      const result = await adapter.parseStructuredParams(
        action,
        params,
        options,
      );

      expect(result).toEqual([
        {
          deepThink: true,
          field: 'value',
        },
      ]);
    });
  });

  describe('formatErrorMessage', () => {
    it('should format ADB errors', () => {
      const error = { message: 'adb connection failed' };
      const result = adapter.formatErrorMessage(error);

      expect(result).toContain('ADB connection error');
      expect(result).toContain('USB debugging');
    });

    it('should format UIAutomator errors', () => {
      const error = { message: 'UIAutomator server not found' };
      const result = adapter.formatErrorMessage(error);

      expect(result).toContain('UIAutomator error');
      expect(result).toContain('UIAutomator server is running');
    });

    it('should use basic formatting for other errors', () => {
      const error = { message: 'general error' };
      const result = adapter.formatErrorMessage(error);

      expect(result).toBe('general error');
    });
  });

  describe('executeAction', () => {
    it('should execute via server when in browser environment', async () => {
      const mockResponse = { result: 'success' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const value: FormValue = {
        type: 'click',
        prompt: 'click button',
        params: { target: 'button' },
      };
      const options: ExecutionOptions = {
        deepThink: true,
        requestId: 'req-123',
      };

      const result = await adapter.executeAction('click', value, options);

      expect(result).toBe(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(`${mockServerUrl}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: undefined,
          type: 'click',
          prompt: 'click button',
          requestId: 'req-123',
          deepThink: true,
          params: { target: 'button' },
        }),
      });
    });

    it('should throw error when no server URL provided', async () => {
      const adapterNoUrl = new RemoteExecutionAdapter();
      (adapterNoUrl as any).serverUrl = undefined;

      const value: FormValue = { type: 'click', prompt: 'click button' };
      const options: ExecutionOptions = {};

      await expect(
        adapterNoUrl.executeAction('click', value, options),
      ).rejects.toThrow('Remote execution adapter requires server URL');
    });

    it('should handle server errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Server error'),
      });

      const value: FormValue = { type: 'click', prompt: 'click button' };
      const options: ExecutionOptions = {};

      await expect(
        adapter.executeAction('click', value, options),
      ).rejects.toThrow('Server request failed (500): Server error');
    });

    it('should handle network errors', async () => {
      const networkError = new Error('Network error');
      mockFetch.mockRejectedValueOnce(networkError);

      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const value: FormValue = { type: 'click', prompt: 'click button' };
      const options: ExecutionOptions = {};

      await expect(
        adapter.executeAction('click', value, options),
      ).rejects.toThrow('Network error');

      expect(consoleSpy).toHaveBeenCalledWith(
        'Execute via server failed:',
        networkError,
      );
      consoleSpy.mockRestore();
    });
  });

  describe('getActionSpace', () => {
    it('should get action space from server', async () => {
      const mockActions = [{ name: 'click', description: 'Click action' }];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockActions),
      });

      const context = { test: 'context' };
      const result = await adapter.getActionSpace(context);

      expect(result).toBe(mockActions);
      expect(mockFetch).toHaveBeenCalledWith(`${mockServerUrl}/action-space`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context }),
      });
    });

    it('should fallback to context.actionSpace when server fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Server error',
      });

      const mockActions = [{ name: 'click', description: 'Click action' }];
      const context = {
        actionSpace: vi.fn().mockResolvedValue(mockActions),
      };

      const result = await adapter.getActionSpace(context);

      expect(result).toBe(mockActions);
      expect(context.actionSpace).toHaveBeenCalled();
    });

    it('should return empty array when all methods fail', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const context = {};
      const result = await adapter.getActionSpace(context);

      expect(result).toEqual([]);
      consoleSpy.mockRestore();
    });

    it('should handle non-array server response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ not: 'array' }),
      });

      const context = { test: 'context' };
      const result = await adapter.getActionSpace(context);

      expect(result).toEqual([]);
    });
  });

  describe('checkStatus', () => {
    it('should return true when server responds with 200', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
      });

      const result = await adapter.checkStatus();

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(`${mockServerUrl}/status`);
    });

    it('should return false when server responds with non-200', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 500,
      });

      const result = await adapter.checkStatus();

      expect(result).toBe(false);
    });

    it('should return false when no server URL', async () => {
      const adapterNoUrl = new RemoteExecutionAdapter();
      (adapterNoUrl as any).serverUrl = undefined;

      const result = await adapterNoUrl.checkStatus();

      expect(result).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return false when fetch fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await adapter.checkStatus();

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Server status check failed:',
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });
  });

  describe('overrideConfig', () => {
    it('should override config successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      });

      const aiConfig = { model: 'test' };
      await adapter.overrideConfig(aiConfig);

      expect(mockFetch).toHaveBeenCalledWith(`${mockServerUrl}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiConfig }),
      });
    });

    it('should throw error when no server URL', async () => {
      const adapterNoUrl = new RemoteExecutionAdapter();
      (adapterNoUrl as any).serverUrl = undefined;

      const aiConfig = { model: 'test' };

      await expect(adapterNoUrl.overrideConfig(aiConfig)).rejects.toThrow(
        'Server URL not configured',
      );
    });

    it('should handle server errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Bad Request',
      });

      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const aiConfig = { model: 'test' };

      await expect(adapter.overrideConfig(aiConfig)).rejects.toThrow(
        'Failed to override server config: Bad Request',
      );

      consoleSpy.mockRestore();
    });
  });

  describe('getTaskProgress', () => {
    it('should get task progress successfully', async () => {
      const mockProgress = { tip: 'Processing...' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockProgress),
      });

      const result = await adapter.getTaskProgress('req-123');

      expect(result).toBe(mockProgress);
      expect(mockFetch).toHaveBeenCalledWith(
        `${mockServerUrl}/task-progress/req-123`,
      );
    });

    it('should return undefined tip when no server URL', async () => {
      const adapterNoUrl = new RemoteExecutionAdapter();
      (adapterNoUrl as any).serverUrl = undefined;

      const result = await adapterNoUrl.getTaskProgress('req-123');

      expect(result).toEqual({ tip: undefined });
    });

    it('should handle invalid requestId', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await adapter.getTaskProgress('  ');

      expect(result).toEqual({ tip: undefined });
      expect(consoleSpy).toHaveBeenCalledWith(
        'Invalid requestId provided for task progress',
      );
      consoleSpy.mockRestore();
    });

    it('should handle server errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found',
      });

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await adapter.getTaskProgress('req-123');

      expect(result).toEqual({ tip: undefined });
      expect(consoleSpy).toHaveBeenCalledWith(
        'Task progress request failed: Not Found',
      );
      consoleSpy.mockRestore();
    });
  });

  describe('cancelTask', () => {
    it('should cancel task successfully', async () => {
      const mockResult = { cancelled: true };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResult),
      });

      const result = await adapter.cancelTask('req-123');

      expect(result).toEqual({ success: true, cancelled: true });
      expect(mockFetch).toHaveBeenCalledWith(
        `${mockServerUrl}/cancel/req-123`,
        {
          method: 'POST',
        },
      );
    });

    it('should return error when no server URL', async () => {
      const adapterNoUrl = new RemoteExecutionAdapter();
      (adapterNoUrl as any).serverUrl = undefined;

      const result = await adapterNoUrl.cancelTask('req-123');

      expect(result).toEqual({ error: 'No server URL configured' });
    });

    it('should handle invalid requestId', async () => {
      const result = await adapter.cancelTask('  ');

      expect(result).toEqual({ error: 'Invalid request ID' });
    });

    it('should handle server errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Internal Server Error',
      });

      const result = await adapter.cancelTask('req-123');

      expect(result).toEqual({
        error: 'Cancel request failed: Internal Server Error',
      });
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const result = await adapter.cancelTask('req-123');

      expect(result).toEqual({ error: 'Failed to cancel task' });
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to cancel task:',
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });
  });
});
