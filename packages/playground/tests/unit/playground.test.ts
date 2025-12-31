import type { DeviceAction } from '@midscene/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { LocalExecutionAdapter } from '../../src/adapters/local-execution';
import { RemoteExecutionAdapter } from '../../src/adapters/remote-execution';
import { PlaygroundSDK } from '../../src/sdk';
import type {
  ExecutionOptions,
  FormValue,
  PlaygroundAgent,
  PlaygroundConfig,
} from '../../src/types';

describe('Playground Integration Tests', () => {
  describe('End-to-end workflow with LocalExecutionAdapter', () => {
    let mockAgent: PlaygroundAgent;
    let sdk: PlaygroundSDK;

    beforeEach(() => {
      mockAgent = {
        getActionSpace: async () => [
          {
            name: 'click',
            description: 'Click on an element',
            interfaceAlias: 'click',
            paramSchema: {
              shape: {
                locateField: {},
              },
              parse: (params: any) => params,
              _def: {},
              _type: undefined as any,
              _output: undefined as any,
              _input: undefined as any,
            } as any,
            call: async (param: any, context: any) => {},
          },
          {
            name: 'aiQuery',
            description: 'Query information from the page',
            interfaceAlias: 'aiQuery',
            call: async (param: any, context: any) => {},
          },
        ],
        callActionInActionSpace: async (
          actionName: string,
          params: unknown,
        ) => {
          if (actionName === 'click') {
            return { success: true, action: 'clicked', params };
          }
          if (actionName === 'aiQuery') {
            return { result: 'query result', params };
          }
          return null;
        },
        aiQuery: async (prompt: string, options?: any) => {
          return { result: `Query result for: ${prompt}`, options };
        },
        dumpDataString: () => JSON.stringify({ executions: [{}] }),
        reportHTMLString: () => '',
        writeOutActionDumps: () => {},
        resetDump: () => {},
      } as unknown as PlaygroundAgent;

      const config: PlaygroundConfig = {
        type: 'local-execution',
        agent: mockAgent,
      };

      sdk = new PlaygroundSDK(config);
    });

    it('should validate and execute a structured action', async () => {
      const mockPage = {
        actionSpace: async () => mockAgent.getActionSpace?.(),
      };
      const actionSpace = await sdk.getActionSpace(mockPage);
      const clickAction = actionSpace.find((action) => action.name === 'click');

      expect(clickAction).toBeDefined();

      // Validate parameters
      const value: FormValue = {
        type: 'click',
        params: { locateField: 'button' },
      };
      const validationResult = sdk.validateStructuredParams(value, clickAction);

      expect(validationResult.valid).toBe(true);

      // Execute the action
      const options: ExecutionOptions = { deepThink: true };
      const result = await sdk.executeAction('click', value, options);

      expect(result).toEqual({
        result: {
          success: true,
          action: 'clicked',
          params: {
            deepThink: true,
            locateField: {
              prompt: 'button',
              deepThink: true,
              cacheable: true,
              xpath: undefined,
            },
          },
        },
        dump: {},
        reportHTML: null,
        error: null,
      });
    });

    it('should handle prompt-based actions', async () => {
      const value: FormValue = {
        type: 'aiQuery',
        prompt: 'What is the page title?',
      };
      const options: ExecutionOptions = { screenshotIncluded: true };

      const result = await sdk.executeAction('aiQuery', value, options);

      expect(result).toEqual({
        result: {
          result: 'query result',
          params: {
            locate: {
              prompt: 'What is the page title?',
              deepThink: false,
              cacheable: true,
              xpath: undefined,
            },
            screenshotIncluded: true,
          },
        },
        dump: {},
        reportHTML: null,
        error: null,
      });
    });

    it('should create appropriate display content', async () => {
      const mockPage = {
        actionSpace: async () => mockAgent.getActionSpace?.(),
      };
      const actionSpace = await sdk.getActionSpace(mockPage);
      const clickAction = actionSpace.find((action) => action.name === 'click');

      // Test structured parameters display
      const structuredValue: FormValue = {
        type: 'click',
        params: { locateField: 'submit button' },
      };

      const structuredDisplay = sdk.createDisplayContent(
        structuredValue,
        true,
        clickAction,
      );

      expect(structuredDisplay).toContain('LocateField: "submit button"');

      // Test prompt-based display
      const promptValue: FormValue = {
        type: 'aiQuery',
        prompt: 'Find the main content',
      };

      const promptDisplay = sdk.createDisplayContent(
        promptValue,
        false,
        undefined,
      );

      expect(promptDisplay).toBe('Find the main content');
    });

    it('should format error messages appropriately', async () => {
      const extensionError = new Error(
        'conflict of different extension detected',
      );
      const formattedError = sdk.formatErrorMessage(extensionError);

      expect(formattedError).toContain('Conflicting extension detected');
      expect(formattedError).toContain('midscenejs.com');
    });

    it('should handle action space retrieval', async () => {
      const mockPage = {
        actionSpace: async () => mockAgent.getActionSpace?.(),
      };
      const actionSpace = await sdk.getActionSpace(mockPage);

      expect(Array.isArray(actionSpace)).toBe(true);
      expect(actionSpace.length).toBe(2);

      const actionNames = actionSpace.map((action) => action.name);
      expect(actionNames).toContain('click');
      expect(actionNames).toContain('aiQuery');
    });
  });

  describe('LocalExecutionAdapter specific features', () => {
    let adapter: LocalExecutionAdapter;
    let mockAgent: PlaygroundAgent;

    beforeEach(() => {
      mockAgent = {
        getActionSpace: async () => [],
        onTaskStartTip: undefined,
        destroy: async () => {},
        aiQuery: async (prompt: string, options?: any) => {
          return { result: `Query result for: ${prompt}`, options };
        },
        dumpDataString: () => JSON.stringify({ executions: [{}] }),
        reportHTMLString: () => '',
        writeOutActionDumps: () => {},
        resetDump: () => {},
      } as unknown as PlaygroundAgent;

      adapter = new LocalExecutionAdapter(mockAgent);
    });

    it('should handle task cancellation', async () => {
      const result = await adapter.cancelTask('test-request');

      expect(result).toEqual({ success: true, dump: {}, reportHTML: null });
    });
  });

  describe('RemoteExecutionAdapter specific features', () => {
    let adapter: RemoteExecutionAdapter;

    beforeEach(() => {
      adapter = new RemoteExecutionAdapter('http://test-server:3000');
    });

    it('should handle Android-specific errors', () => {
      const adbError = new Error('adb device not found');
      const formattedError = adapter.formatErrorMessage(adbError);

      expect(formattedError).toContain('ADB connection error');
      expect(formattedError).toContain('USB debugging');
    });

    it('should handle UIAutomator errors', () => {
      const uiAutomatorError = new Error('UIAutomator service failed');
      const formattedError = adapter.formatErrorMessage(uiAutomatorError);

      expect(formattedError).toContain('UIAutomator error');
      expect(formattedError).toContain('UIAutomator server is running');
    });

    it('should parse structured params correctly', async () => {
      const action: DeviceAction<unknown> = {
        name: 'scroll',
        description: 'Scroll action',
        paramSchema: {
          shape: {
            direction: {},
            distance: {},
          },
        },
      };

      const params = {
        direction: 'down',
        distance: 100,
        empty: '',
        undefined: undefined,
      };

      const options: ExecutionOptions = {
        deepThink: true,
        requestId: 'scroll-123',
      };

      const result = await adapter.parseStructuredParams(
        action,
        params,
        options,
      );

      expect(result).toEqual([
        {
          deepThink: true,
          requestId: 'scroll-123',
          direction: 'down',
          distance: 100,
        },
      ]);
    });
  });

  describe('SDK adapter selection', () => {
    it('should create LocalExecutionAdapter for local-execution type', () => {
      const config: PlaygroundConfig = {
        type: 'local-execution',
        agent: {},
      };

      const sdk = new PlaygroundSDK(config);
      expect(sdk).toBeDefined();
    });

    it('should create RemoteExecutionAdapter for remote-execution type', () => {
      const config: PlaygroundConfig = {
        type: 'remote-execution',
        serverUrl: 'http://localhost:3000',
      };

      const sdk = new PlaygroundSDK(config);
      expect(sdk).toBeDefined();
    });

    it('should throw error for unknown execution type', () => {
      const config = {
        type: 'unknown-type',
      } as unknown as PlaygroundConfig;

      expect(() => new PlaygroundSDK(config)).toThrow(
        'Unsupported execution type: unknown-type',
      );
    });
  });

  describe('Cross-adapter compatibility', () => {
    it('should provide consistent interface across adapters', async () => {
      const localConfig: PlaygroundConfig = {
        type: 'local-execution',
        agent: {
          getActionSpace: async () => [],
        },
      };

      const remoteConfig: PlaygroundConfig = {
        type: 'remote-execution',
        serverUrl: 'http://localhost:3000',
      };

      const localSDK = new PlaygroundSDK(localConfig);
      const remoteSDK = new PlaygroundSDK(remoteConfig);

      // Both should have the same interface
      expect(typeof localSDK.executeAction).toBe('function');
      expect(typeof localSDK.getActionSpace).toBe('function');
      expect(typeof localSDK.validateStructuredParams).toBe('function');
      expect(typeof localSDK.formatErrorMessage).toBe('function');
      expect(typeof localSDK.createDisplayContent).toBe('function');
      expect(typeof localSDK.checkStatus).toBe('function');

      expect(typeof remoteSDK.executeAction).toBe('function');
      expect(typeof remoteSDK.getActionSpace).toBe('function');
      expect(typeof remoteSDK.validateStructuredParams).toBe('function');
      expect(typeof remoteSDK.formatErrorMessage).toBe('function');
      expect(typeof remoteSDK.createDisplayContent).toBe('function');
      expect(typeof remoteSDK.checkStatus).toBe('function');
    });
  });
});
