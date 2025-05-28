import { ScriptPlayer, parseYamlScript } from '@/yaml';
import type { MidsceneYamlScriptWebEnv } from '@midscene/core';
import { beforeEach, describe, expect, test, vi } from 'vitest';

// Mock agent that tracks method calls
const createMockAgent = () => {
  const methodCalls: Array<{ method: string; args: any[] }> = [];

  return {
    agent: {
      aiRightClick: vi.fn(async (...args) => {
        methodCalls.push({ method: 'aiRightClick', args });
        return {};
      }),
      aiTap: vi.fn(async (...args) => {
        methodCalls.push({ method: 'aiTap', args });
        return {};
      }),
      aiAction: vi.fn(async (...args) => {
        methodCalls.push({ method: 'aiAction', args });
        return {};
      }),
      reportFile: null,
      onTaskStartTip: undefined,
    },
    freeFn: [],
    methodCalls,
  };
};

const setupAgent = async (target: MidsceneYamlScriptWebEnv) => {
  return createMockAgent() as any;
};

describe('YAML Player - aiRightClick Integration', () => {
  test('should parse and execute aiRightClick from YAML', async () => {
    const yamlString = `
target:
  url: "https://example.com"
tasks:
  - name: test_right_click
    flow:
      - aiRightClick: "context menu trigger element"
`;

    const script = parseYamlScript(yamlString);
    const player = new ScriptPlayer<MidsceneYamlScriptWebEnv>(
      script,
      setupAgent,
    );

    await player.run();

    // Verify the player completed successfully
    expect(player.status).toBe('done');
    expect(player.taskStatusList[0].status).toBe('done');
  });

  test('should execute aiRightClick with options', async () => {
    const yamlString = `
target:
  url: "https://example.com"
tasks:
  - name: test_right_click_with_options
    flow:
      - aiRightClick: "element to right click"
        deepThink: true
        cacheable: false
`;

    const script = parseYamlScript(yamlString);
    const mockSetup = createMockAgent();
    const player = new ScriptPlayer<MidsceneYamlScriptWebEnv>(
      script,
      async () => mockSetup as any,
    );

    await player.run();

    // Verify the player completed successfully
    expect(player.status).toBe('done');

    // Verify aiRightClick was called with correct parameters
    expect(mockSetup.agent.aiRightClick).toHaveBeenCalledWith(
      'element to right click',
      {
        aiRightClick: 'element to right click',
        deepThink: true,
        cacheable: false,
      },
    );
  });

  test('should execute mixed flow with aiRightClick', async () => {
    const yamlString = `
target:
  url: "https://example.com"
tasks:
  - name: mixed_interactions
    flow:
      - aiTap: "open menu button"
      - aiRightClick: "item in menu"
      - aiAction: "select copy from context menu"
`;

    const script = parseYamlScript(yamlString);
    const mockSetup = createMockAgent();
    const player = new ScriptPlayer<MidsceneYamlScriptWebEnv>(
      script,
      async () => mockSetup as any,
    );

    await player.run();

    // Verify the player completed successfully
    expect(player.status).toBe('done');

    // Verify all methods were called in correct order
    expect(mockSetup.methodCalls).toEqual([
      {
        method: 'aiTap',
        args: ['open menu button', { aiTap: 'open menu button' }],
      },
      {
        method: 'aiRightClick',
        args: ['item in menu', { aiRightClick: 'item in menu' }],
      },
      {
        method: 'aiAction',
        args: ['select copy from context menu', { cacheable: undefined }],
      },
    ]);
  });

  test('should handle aiRightClick errors gracefully', async () => {
    const yamlString = `
target:
  url: "https://example.com"
tasks:
  - name: test_right_click_error
    flow:
      - aiRightClick: "non-existent element"
`;

    const script = parseYamlScript(yamlString);

    // Create mock that throws error
    const errorMockSetup = {
      agent: {
        aiRightClick: vi.fn(async () => {
          throw new Error('Element not found for right click');
        }),
        reportFile: null,
        onTaskStartTip: undefined,
      },
      freeFn: [],
    };

    const player = new ScriptPlayer<MidsceneYamlScriptWebEnv>(
      script,
      async () => errorMockSetup as any,
    );

    await player.run();

    // Verify the player handled error correctly
    expect(player.status).toBe('error');
    expect(player.taskStatusList[0].status).toBe('error');
    expect(player.taskStatusList[0].error?.message).toBe(
      'Element not found for right click',
    );
  });

  test('should continue on error when continueOnError is true', async () => {
    const yamlString = `
target:
  url: "https://example.com"  
tasks:
  - name: test_continue_on_error
    continueOnError: true
    flow:
      - aiRightClick: "non-existent element"
  - name: test_second_task
    flow:
      - aiTap: "some button"
`;

    const script = parseYamlScript(yamlString);

    // Create mock where first call throws error, second succeeds
    const errorMockSetup = {
      agent: {
        aiRightClick: vi.fn(async () => {
          throw new Error('Element not found for right click');
        }),
        aiTap: vi.fn(async () => {
          return {};
        }),
        reportFile: null,
        onTaskStartTip: undefined,
      },
      freeFn: [],
    };

    const player = new ScriptPlayer<MidsceneYamlScriptWebEnv>(
      script,
      async () => errorMockSetup as any,
    );

    await player.run();

    // Verify the player completed despite first task error
    expect(player.status).toBe('done');
    expect(player.taskStatusList[0].status).toBe('error');
    expect(player.taskStatusList[1].status).toBe('done');

    // Verify both methods were called
    expect(errorMockSetup.agent.aiRightClick).toHaveBeenCalled();
    expect(errorMockSetup.agent.aiTap).toHaveBeenCalled();
  });
});
