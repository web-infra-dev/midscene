import path, { join, resolve } from 'node:path';
import { assert } from '@midscene/shared/utils';

import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import type { PageAgent } from '@/index';
import { puppeteerAgentForTarget } from '@/puppeteer/agent-launcher';
import { ScriptPlayer, buildYaml, parseYamlScript } from '@/yaml';
import type {
  DeviceAction,
  GroupedActionDump,
  MidsceneYamlScriptWebEnv,
} from '@midscene/core';
import { getMidsceneRunSubDir } from '@midscene/shared/common';
import { type MockedFunction, describe, expect, test, vi } from 'vitest';

const serverRoot = join(__dirname, 'server_root');

const runYaml = async (yamlString: string, ignoreStatusAssertion = false) => {
  const script = parseYamlScript(yamlString);
  const statusUpdate = vi.fn();
  const player = new ScriptPlayer<MidsceneYamlScriptWebEnv>(
    script,
    puppeteerAgentForTarget,
    statusUpdate,
  );
  await player.run();
  if (!ignoreStatusAssertion) {
    assert(
      player.status === 'done',
      player.errorInSetup?.message || 'unknown error',
    );
    expect(statusUpdate).toHaveBeenCalled();
  }
  return {
    player,
    statusUpdate,
  };
};

const shouldRunAITest =
  process.platform !== 'linux' || process.env.AITEST === 'true';

// Mock agent that tracks method calls
const getMockAgent = async () => {
  const methodCalls: Array<{ method: string; args: any[] }> = [];
  const dumpPath = path.join(__dirname, '../fixtures', 'dump.json');
  const dump = JSON.parse(
    readFileSync(dumpPath, 'utf-8'),
  ) as unknown as GroupedActionDump;

  const actionSpace: DeviceAction[] = [
    {
      name: 'Tap',
      interfaceAlias: 'aiTap',
      call: vi.fn(),
    },
    {
      name: 'RightClick',
      interfaceAlias: 'aiRightClick',
      call: vi.fn(),
    },
    {
      name: 'Hover',
      interfaceAlias: 'aiHover',
      call: vi.fn(),
    },
    {
      name: 'Input',
      interfaceAlias: 'aiInput',
      call: vi.fn(),
    },
  ];

  return {
    agent: {
      aiTap: vi.fn(async (...args) => {
        methodCalls.push({ method: 'aiTap', args });
        return {};
      }),
      aiRightClick: vi.fn(async (...args) => {
        methodCalls.push({ method: 'aiRightClick', args });
        return {};
      }),
      aiAction: vi.fn(async (...args) => {
        methodCalls.push({ method: 'aiAction', args });
        return {};
      }),
      aiInput: vi.fn(),
      aiScroll: vi.fn(),
      aiKeyboardPress: vi.fn(),
      reportFile: null,
      onTaskStartTip: undefined,
      _unstableLogContent: vi.fn(async () => dump),
      dump,
      callActionInActionSpace: vi.fn(),
      getActionSpace: async () => actionSpace,
    } as unknown as PageAgent,
    freeFn: [],
    methodCalls,
    actionSpace,
  };
};

describe('yaml utils', () => {
  test('basic build && load', () => {
    const script = buildYaml(
      {
        url: 'https://bing.com',
        waitForNetworkIdle: {
          timeout: 1000,
          continueOnNetworkIdleError: true,
        },
      },
      [
        {
          name: 'search',
          flow: [
            {
              aiAction: 'type "hello" in search box, hit enter',
            },
          ],
        },
      ],
    );
    expect(script).toMatchSnapshot();

    const loadedScript = parseYamlScript(script);
    expect(loadedScript).toMatchSnapshot();
  });

  test('load error with filePath', () => {
    expect(() => {
      parseYamlScript(
        `
      target:
        a: 1
      `,
        'some_error_path',
      );
    }).toThrow(/some_error_path/);
  });

  test('player - bad params', async () => {
    expect(async () => {
      await runYaml(`
          target:
            serve: ${serverRoot}
        `);
    }).rejects.toThrow();

    expect(async () => {
      await runYaml(`
          target:
            serve: ${serverRoot}
            viewportWidth: 0
        `);
    }).rejects.toThrow();
  });
});

describe.skipIf(!shouldRunAITest)(
  'player - e2e',
  () => {
    test('flush output even if assertion failed', async () => {
      const outputPath = `./midscene_run/output/${randomUUID()}.json`;
      const yamlString = `
      target:
        url: https://www.bing.com
        output: ${outputPath}
      tasks:
        - name: local page
          flow:
            - aiQuery: >
                the background color of the page, { color: 'white' | 'black' | 'red' | 'green' | 'blue' | 'yellow' | 'purple' | 'orange' | 'pink' | 'brown' | 'gray' | 'black' 
        - name: check content
          flow:
            - aiAssert: this is a food delivery service app
      `;
      await expect(async () => {
        await runYaml(yamlString);
      }).rejects.toThrow();

      expect(existsSync(outputPath)).toBe(true);
    });

    test('set output path correctly', async () => {
      const yamlString = `
      target:
        url: https://bing.com
        output: ./midscene_run/output/abc.json
      tasks:
        - name: check content
          flow:
            - aiQuery: title of the page
      `;
      const { player } = await runYaml(yamlString);
      expect(player.output).toBe(
        resolve(process.cwd(), './midscene_run/output/abc.json'),
      );

      const yamlString2 = `
      web:
        url: https://bing.com
        output: ./midscene_run/output/def.json
      tasks:
        - name: check content
          flow:
            - aiQuery: title of the page
      `;
      const { player: player2 } = await runYaml(yamlString2);
      expect(player2.output).toBe(
        resolve(process.cwd(), './midscene_run/output/def.json'),
      );
    });

    test('cookie', async () => {
      const yamlString = `
      target:
        url: http://httpbin.dev/cookies
        cookie: ./tests/unit-test/fixtures/cookie/httpbin.dev_cookies.json
      tasks:
        - name: check cookie
          flow:
            - aiAssert: the value of midscene_foo is "bar"
    `;
      await runYaml(yamlString);
    });

    test('online server - lazy response', async () => {
      const yamlString = `
      target:
        url: https://httpbin.org/delay/60000
        waitForNetworkIdle:
          timeout: 10
          continueOnNetworkIdleError: false
      tasks:
        - name: check content
          flow:
            - aiAssert: the response is "Hello, world!"
    `;

      expect(async () => {
        await runYaml(yamlString);
      }).rejects.toThrow(/TimeoutError/i);
    });

    test('stop on task error', async () => {
      const yamlString = `
      target:
        url: https://bing.com/
      tasks:
        - name: assert1
          flow:
            - aiAssert: this is a food delivery service app
        - name: assert2
          flow:
            - aiAssert: this is a search engine
      `;

      const { player } = await runYaml(yamlString, true);
      expect(player.status).toBe('error');
      expect(player.taskStatusList[0].status).toBe('error');
      expect(player.taskStatusList[1].status).toBe('init');
    });

    test('allow continue on task error', async () => {
      const yamlString = `
      target:
        url: https://bing.com/
      tasks:
        - name: assert1
          continueOnError: true
          flow:
            - aiAssert: this is a food delivery service app
        - name: assert2
          flow:
            - aiAssert: this is a search engine
      `;
      const { player } = await runYaml(yamlString, true);
      expect(player.status).toBe('done');
      expect(player.taskStatusList[0].status).toBe('error');
      expect(player.taskStatusList[1].status).toBe('done');
    });
  },
  60 * 1000,
);

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
      getMockAgent,
    );

    await player.run();

    // Verify the player completed successfully
    expect(player.errorInSetup).toBeUndefined();
    expect(player.taskStatusList[0].error).toBeUndefined();
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
        moreParam: 
        foo: 123 
`;

    const script = parseYamlScript(yamlString);
    const mockAgent = await getMockAgent();
    const player = new ScriptPlayer<MidsceneYamlScriptWebEnv>(
      script,
      async () => mockAgent,
    );

    await player.run();

    // Verify the player completed successfully
    expect(player.status).toBe('done');
    expect(player.errorInSetup).toBeUndefined();

    // Verify aiRightClick was called with correct parameters
    expect(mockAgent.agent.aiRightClick).toBeCalledTimes(0);
    expect(
      (mockAgent.agent.callActionInActionSpace as MockedFunction<any>).mock
        .calls,
    ).toMatchInlineSnapshot(`
      [
        [
          "RightClick",
          "element to right click",
          {
            "cacheable": false,
            "deepThink": true,
            "foo": 123,
            "moreParam": null,
          },
        ],
      ]
    `);
  });

  test('action from action space', async () => {
    const yamlString = `
target:
  url: "https://example.com"
tasks:
  - name: test_right_click_with_options
    flow:
      - action_space_RightClick: "element to right click"
        deepThink: true
        cacheable: false
        moreParam: 456
      - action_space_Input: "input field 1"
        value: "i am value 1"
      - aiRightClick: "item in menu"

`;

    const script = parseYamlScript(yamlString);
    const mockAgent = await getMockAgent();
    const player = new ScriptPlayer<MidsceneYamlScriptWebEnv>(
      script,
      async () => mockAgent,
    );

    await player.run();

    // Verify the player completed successfully
    expect(player.status).toBe('done');
    expect(player.errorInSetup).toBeUndefined();

    expect(
      (mockAgent.agent.callActionInActionSpace as MockedFunction<any>).mock
        .calls,
    ).toMatchInlineSnapshot(`
      [
        [
          "RightClick",
          "element to right click",
          {
            "cacheable": false,
            "deepThink": true,
            "moreParam": 456,
          },
        ],
        [
          "Input",
          "input field 1",
          {
            "value": "i am value 1",
          },
        ],
        [
          "RightClick",
          "item in menu",
          {},
        ],
      ]
    `);
  });

  test('aiInput, aiScroll, aiKeyboardPress , different style', async () => {
    const yamlString = `
target:
  url: "https://example.com"
tasks:
  - name: test_right_click_with_options
    flow:
      - aiInput: 'i am value 1'
        locate: 'input field 1'
      - aiInput: 'input field 2'
        value: 'i am value 2'
      - aiScroll: 'scrollable area A'
        direction: 'down'
        scrollType: 'once'
        distance: 100
      - aiScroll: 
        locate: 'scrollable area B'
        direction: 'up'
        scrollType: 'once'
        distance: 100
      - aiKeyboardPress: 'input field 3'
        key: 'Enter'
      - aiKeyboardPress: 'Control'
        locate: 'input field 4'
`;

    const script = parseYamlScript(yamlString);
    const mockAgent = await getMockAgent();
    const player = new ScriptPlayer<MidsceneYamlScriptWebEnv>(
      script,
      async () => mockAgent,
    );

    await player.run();
    console.log(player);

    // Verify the player completed successfully
    expect(player.errorInSetup).toBeUndefined();
    expect(player.status).toBe('done');

    // Verify aiRightClick was called with correct parameters
    expect(mockAgent.agent.callActionInActionSpace).not.toHaveBeenCalled();
    expect(
      (mockAgent.agent.aiInput as MockedFunction<any>).mock.calls,
    ).toMatchInlineSnapshot(`
      [
        [
          "input field 1",
          {
            "aiInput": "i am value 1",
            "locate": "input field 1",
            "value": "i am value 1",
          },
        ],
        [
          "input field 2",
          {
            "aiInput": "input field 2",
            "value": "i am value 2",
          },
        ],
      ]
    `);

    expect(
      (mockAgent.agent.aiScroll as MockedFunction<any>).mock.calls,
    ).toMatchInlineSnapshot(`
      [
        [
          "scrollable area A",
          {
            "aiScroll": "scrollable area A",
            "direction": "down",
            "distance": 100,
            "scrollType": "once",
          },
        ],
        [
          "scrollable area B",
          {
            "aiScroll": null,
            "direction": "up",
            "distance": 100,
            "locate": "scrollable area B",
            "scrollType": "once",
          },
        ],
      ]
    `);

    expect(
      (mockAgent.agent.aiKeyboardPress as MockedFunction<any>).mock.calls,
    ).toMatchInlineSnapshot(`
      [
        [
          "input field 3",
          {
            "aiKeyboardPress": "input field 3",
            "key": "Enter",
            "keyName": "Enter",
          },
        ],
        [
          "input field 4",
          {
            "aiKeyboardPress": "Control",
            "keyName": "Control",
            "locate": "input field 4",
          },
        ],
      ]
    `);
  });

  test('should handle errors in action space', async () => {
    const yamlString = `
target:
  url: "https://example.com"
tasks:
  - name: test_right_click_error
    flow:
      - action_space_no_such_action: "non-existent element"
`;

    const script = parseYamlScript(yamlString);
    const mockAgent = await getMockAgent();
    const player = new ScriptPlayer<MidsceneYamlScriptWebEnv>(
      script,
      async () => mockAgent,
    );

    await player.run();

    // Verify the player handled error correctly
    expect(player.status).toBe('error');
    expect(player.taskStatusList[0].status).toBe('error');
    expect(player.taskStatusList[0].error).toBeDefined();
  });

  test('should continue on error when continueOnError is true', async () => {
    const yamlString = `
target:
  url: "https://example.com"  
tasks:
  - name: test_continue_on_error
    continueOnError: true
    flow:
      - non_existent_action: "non-existent element"
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
        reportFile: null,
        onTaskStartTip: undefined,
        getActionSpace: async () => [
          {
            name: 'aiTap',
            interfaceAlias: 'aiTap',
            call: vi.fn(),
          },
        ],
        callActionInActionSpace: vi.fn(),
      },
      freeFn: [],
    };

    const player = new ScriptPlayer<MidsceneYamlScriptWebEnv>(
      script,
      async () => errorMockSetup as any,
    );

    await player.run();

    // Verify the player completed despite first task error
    expect(player.errorInSetup).toBeUndefined();
    console.log(player.taskStatusList);
    expect(player.taskStatusList[0].error).toBeDefined();
    expect(player.taskStatusList[0].status).toBe('error');
    expect(player.taskStatusList[1].status).toBe('done');
    expect(player.status).toBe('done');

    // Verify both methods were called
    expect(
      (errorMockSetup.agent.callActionInActionSpace as MockedFunction<any>).mock
        .calls,
    ).toMatchInlineSnapshot(`
      [
        [
          "aiTap",
          "some button",
          {},
        ],
      ]
    `);
  });
});

describe('YAML Player - unstableLogContent', () => {
  test('should write unstableLogContent to file when unstableLogContent is true', async () => {
    const yamlString = `
target:
  url: "https://example.com"
  unstableLogContent: true
tasks:
  - name: test_right_click
    flow:
      - aiRightClick: "context menu trigger element"
`;

    const script = parseYamlScript(yamlString);
    const player = new ScriptPlayer<MidsceneYamlScriptWebEnv>(
      script,
      getMockAgent,
    );

    await player.run();

    // Verify the player completed successfully
    expect(player.status).toBe('done');

    // Verify the unstableLogContent file was created
    const filePath = resolve(
      getMidsceneRunSubDir('output'),
      'unstableLogContent.json',
    );
    expect(existsSync(filePath)).toBe(true);
  });

  test('should write unstableLogContent to file when unstableLogContent is path', async () => {
    const yamlString = `
target:
  url: "https://example.com"
  unstableLogContent: ./midscene_run/output/unstableLogContent-custom.json
tasks:
  - name: test_right_click
    flow:
      - aiRightClick: "context menu trigger element"
`;

    const script = parseYamlScript(yamlString);
    const player = new ScriptPlayer<MidsceneYamlScriptWebEnv>(
      script,
      getMockAgent,
    );

    await player.run();

    // Verify the player completed successfully
    expect(player.status).toBe('done');

    // Verify the unstableLogContent file was created
    const filePath = resolve(
      getMidsceneRunSubDir('output'),
      'unstableLogContent-custom.json',
    );
    expect(existsSync(filePath)).toBe(true);
  });
});
