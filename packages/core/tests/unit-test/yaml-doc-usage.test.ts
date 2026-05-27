import { Agent } from '@/agent';
import { ScriptPlayer } from '@/yaml/player';
import { interpolateEnvVars, parseYamlScript } from '@/yaml/utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

const createDocAgent = (overrides: Record<string, any> = {}) => {
  const agent = {
    reportFile: '/tmp/doc-report.html',
    onTaskStartTip: undefined,
    aiAct: vi.fn(async () => undefined),
    aiTap: vi.fn(async () => undefined),
    aiScroll: vi.fn(async () => undefined),
    aiQuery: vi.fn(async () => ({ id: 'SKU-123', title: 'doc item' })),
    aiNumber: vi.fn(async () => 42),
    aiString: vi.fn(async () => 'SKU-123'),
    aiBoolean: vi.fn(async () => true),
    aiAsk: vi.fn(async () => 'answer'),
    aiLocate: vi.fn(async () => ({
      rect: { x: 1, y: 2, width: 3, height: 4 },
    })),
    aiWaitFor: vi.fn(async () => undefined),
    aiAssert: vi.fn(async () => ({
      pass: true,
      thought: 'ok',
      message: 'passed',
    })),
    evaluateJavaScript: vi.fn(async () => 'js-result'),
    recordToReport: vi.fn(async () => undefined),
    runAdbShell: vi.fn(async () => 'adb-result'),
    callActionInActionSpace: vi.fn(async () => 'action-result'),
    getActionSpace: vi.fn(async () => [
      { name: 'Hover', interfaceAlias: 'aiHover' },
      { name: 'DoubleClick', interfaceAlias: 'aiDoubleClick' },
      { name: 'RightClick', interfaceAlias: 'aiRightClick' },
      { name: 'Launch', interfaceAlias: 'launch' },
      { name: 'Terminate', interfaceAlias: 'terminate' },
      { name: 'RunAdbShell', interfaceAlias: 'runAdbShell' },
      { name: 'RunWdaRequest', interfaceAlias: 'runWdaRequest' },
    ]),
    _unstableLogContent: vi.fn(() => ({ logs: [] })),
    ...overrides,
  };

  return agent as any;
};

describe('YAML docs usage coverage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    process.env.DOC_TOPIC = undefined;
  });

  it('parses the documented environment and agent sections', () => {
    const script = parseYamlScript(`
agent:
  testId: "checkout-test"
  groupName: "E2E test suite"
  groupDescription: "Complete checkout flow"
  generateReport: true
  autoPrintReportMsg: false
  reportFileName: "checkout-report"
  replanningCycleLimit: 30
  aiActContext: "If a consent dialog appears, click accept."
  cache:
    id: "checkout-cache"
    strategy: "read-write"
web:
  url: https://www.bing.com
  serve: ./fixtures
  userAgent: doc-agent
  viewportWidth: 1280
  viewportHeight: 720
  deviceScaleFactor: 2
  cookie: ./cookies.json
  waitForNetworkIdle:
    timeout: 3000
    continueOnNetworkIdleError: false
  output: ./output.json
  unstableLogContent: ./unstable-log.json
  forceSameTabNavigation: false
  cdpEndpoint: ws://localhost:9222/devtools/browser
  bridgeMode: newTabWithUrl
  closeNewTabsAfterDisconnect: true
  acceptInsecureCerts: true
  chromeArgs:
    - '--disable-features=ThirdPartyCookiePhaseout'
android:
  deviceId: test-device
  launch: https://www.example.com
  output: ./android-output.json
  imeStrategy: yadb-for-non-ascii
ios:
  wdaPort: 8100
  wdaHost: 127.0.0.1
  autoDismissKeyboard: true
  launch: com.apple.mobilesafari
  output: ./ios-output.json
  unstableLogContent: ./ios-unstable-log.json
computer:
  displayId: main
  output: ./computer-output.json
tasks:
  - name: Search weather
    flow:
      - ai: Search for "weather today"
`);

    expect(script.agent).toMatchObject({
      testId: 'checkout-test',
      reportFileName: 'checkout-report',
      replanningCycleLimit: 30,
      cache: { id: 'checkout-cache', strategy: 'read-write' },
    });
    expect(script.web).toMatchObject({
      url: 'https://www.bing.com',
      viewportWidth: 1280,
      viewportHeight: 720,
      waitForNetworkIdle: {
        timeout: 3000,
        continueOnNetworkIdleError: false,
      },
      cdpEndpoint: 'ws://localhost:9222/devtools/browser',
      bridgeMode: 'newTabWithUrl',
      chromeArgs: ['--disable-features=ThirdPartyCookiePhaseout'],
    });
    expect(script.android).toMatchObject({
      deviceId: 'test-device',
      imeStrategy: 'yadb-for-non-ascii',
    });
    expect(script.ios).toMatchObject({
      wdaPort: 8100,
      wdaHost: '127.0.0.1',
      unstableLogContent: './ios-unstable-log.json',
    });
    expect(script.computer).toMatchObject({ displayId: 'main' });
  });

  it('executes documented task flow items and preserves their options', async () => {
    const script = parseYamlScript(`
web:
  url: about:blank
tasks:
  - name: Documented flow example
    flow:
      - ai: Search for "weather today"
        cacheable: false
        deepThink: true
        deepLocate: true
      - aiAct: Click the search button
        cacheable: true
      - aiAction: Legacy field is still accepted
      - aiTap: Choose file button
        deepLocate: true
        xpath: //*[@id="upload"]
        cacheable: false
        fileChooserAccept:
          - ./fixtures/image1.jpg
          - ./fixtures/image2.png
      - aiTap:
        locate:
          prompt: Choose file button with an image prompt
          images:
            - name: Upload icon
              url: https://example.com/upload.png
          convertHttpImage2Base64: true
        fileChooserAccept: ./fixtures/document.pdf
      - aiHover:
        locate:
          prompt: Move the mouse to the area containing the GitHub logo.
          images:
            - name: GitHub logo
              url: https://example.com/github.png
          convertHttpImage2Base64: true
      - aiDoubleClick: Double-clickable element
      - aiRightClick: Right-clickable element
      - aiInput: Search box
        value: 12345
        xpath: //*[@id="search"]
      - aiKeyboardPress: Search box
        keyName: Enter
      - sleep: 1
      - aiScroll: Results list
        scrollType: singleAction
        direction: down
        distance: 500
      - recordToReport: Current screenshot
        content: Screenshot description
      - aiQuery: "Return product info in this shape: {id: string, title: string}"
        name: item
      - aiNumber: Read the quantity on the page
        name: count
      - aiBoolean: Whether the page shows search results
        name: has_result
      - aiAsk: What is the page title?
        name: title_answer
      - aiLocate: Search button
        name: search_button
      - aiWaitFor: The page shows results
        timeout: 1000
      - aiAssert:
          prompt: Check whether this image appears on the page.
          images:
            - name: Target logo
              url: https://example.com/target.png
        convertHttpImage2Base64: true
        errorMessage: Target image is not visible
        name: image_assert
      - javascript: document.title
        name: page_title
`);
    const agent = createDocAgent();
    const player = new ScriptPlayer(script, async () => ({
      agent,
      freeFn: [],
    }));

    await player.run();

    expect(player.status).toBe('done');
    expect(agent.aiAct).toHaveBeenCalledTimes(3);
    expect(agent.aiTap).toHaveBeenCalledWith('Choose file button', {
      deepLocate: true,
      xpath: '//*[@id="upload"]',
      cacheable: false,
      fileChooserAccept: ['./fixtures/image1.jpg', './fixtures/image2.png'],
    });
    expect(agent.aiTap).toHaveBeenCalledWith(
      'Choose file button with an image prompt',
      {
        images: [
          { name: 'Upload icon', url: 'https://example.com/upload.png' },
        ],
        convertHttpImage2Base64: true,
        fileChooserAccept: './fixtures/document.pdf',
      },
    );
    expect(agent.aiScroll).toHaveBeenCalledWith('Results list', {
      scrollType: 'singleAction',
      direction: 'down',
      distance: 500,
    });
    expect(agent.recordToReport).toHaveBeenCalledWith('Current screenshot', {
      content: 'Screenshot description',
    });
    expect(agent.aiWaitFor).toHaveBeenCalledWith('The page shows results', {
      timeout: 1000,
      timeoutMs: 1000,
    });
    expect(agent.aiAssert).toHaveBeenCalledWith(
      {
        prompt: 'Check whether this image appears on the page.',
        images: [
          { name: 'Target logo', url: 'https://example.com/target.png' },
        ],
      },
      'Target image is not visible',
      {
        convertHttpImage2Base64: true,
        keepRawResponse: true,
      },
    );
    expect(player.result).toMatchObject({
      item: { id: 'SKU-123', title: 'doc item' },
      count: 42,
      has_result: true,
      title_answer: 'answer',
      page_title: 'js-result',
      image_assert: {
        pass: true,
        thought: 'ok',
        message: 'passed',
      },
    });
    expect(agent.callActionInActionSpace).toHaveBeenCalledWith('Hover', {
      locate: {
        prompt: {
          prompt: 'Move the mouse to the area containing the GitHub logo.',
          images: [
            { name: 'GitHub logo', url: 'https://example.com/github.png' },
          ],
          convertHttpImage2Base64: true,
        },
        deepLocate: false,
        cacheable: true,
        xpath: undefined,
      },
    });
    expect(agent.callActionInActionSpace).toHaveBeenCalledWith('DoubleClick', {
      locate: {
        prompt: 'Double-clickable element',
        deepLocate: false,
        cacheable: true,
        xpath: undefined,
      },
    });
    expect(agent.callActionInActionSpace).toHaveBeenCalledWith('RightClick', {
      locate: {
        prompt: 'Right-clickable element',
        deepLocate: false,
        cacheable: true,
        xpath: undefined,
      },
    });
    expect(agent.callActionInActionSpace).toHaveBeenCalledWith('Input', {
      xpath: '//*[@id="search"]',
      value: '12345',
      locate: {
        prompt: 'Search box',
        deepLocate: false,
        cacheable: true,
        xpath: '//*[@id="search"]',
      },
    });
    expect(agent.callActionInActionSpace).toHaveBeenCalledWith(
      'KeyboardPress',
      {
        keyName: 'Enter',
        locate: {
          prompt: 'Search box',
          deepLocate: false,
          cacheable: true,
          xpath: undefined,
        },
      },
    );
  });

  it('supports documented result reuse with full-field and embedded interpolation', async () => {
    const script = parseYamlScript(`
web:
  url: about:blank
tasks:
  - name: Search with extracted result
    flow:
      - aiString: Read the product id from the page
        name: product_id
      - aiInput: Search box
        value: $product_id
      - aiQuery: Get search results after submitting product id \${product_id}
        name: search_result
`);
    const agent = createDocAgent();
    const player = new ScriptPlayer(script, async () => ({
      agent,
      freeFn: [],
    }));

    await player.run();

    expect(player.status).toBe('done');
    expect(agent.callActionInActionSpace).toHaveBeenCalledWith('Input', {
      value: 'SKU-123',
      locate: {
        prompt: 'Search box',
        deepLocate: false,
        cacheable: true,
        xpath: undefined,
      },
    });
    expect(agent.aiQuery).toHaveBeenCalledWith(
      'Get search results after submitting product id SKU-123',
      {},
    );
  });

  it('continues to the next task when documented task continueOnError is enabled', async () => {
    const script = parseYamlScript(`
web:
  url: about:blank
tasks:
  - name: Allowed-to-fail task
    continueOnError: true
    flow:
      - aiAssert: Intentionally fail
  - name: Following task
    flow:
      - javascript: document.title
        name: title
`);
    const agent = createDocAgent({
      aiAssert: vi.fn(async () => ({
        pass: false,
        thought: 'failed',
        message: 'doc failure',
      })),
    });
    const player = new ScriptPlayer(script, async () => ({
      agent,
      freeFn: [],
    }));

    await player.run();

    expect(player.status).toBe('done');
    expect(player.taskStatusList[0].status).toBe('error');
    expect(player.taskStatusList[1].status).toBe('done');
    expect(player.result.title).toBe('js-result');
  });

  it('dispatches documented Android and iOS platform-specific actions', async () => {
    const script = parseYamlScript(`
android:
  deviceId: test-device
tasks:
  - name: Platform actions
    flow:
      - runAdbShell: pm clear com.example.app
      - runAdbShell: dumpsys activity services
        timeout: 60000
        name: services
      - launch: com.android.settings
      - terminate: com.android.settings
      - runWdaRequest:
          method: POST
          endpoint: /session/test/wda/pressButton
          data:
            name: home
        name: wda
`);
    const agent = createDocAgent();
    const player = new ScriptPlayer(script, async () => ({
      agent,
      freeFn: [],
    }));

    await player.run();

    expect(player.status).toBe('done');
    expect(agent.callActionInActionSpace).toHaveBeenCalledWith('RunAdbShell', {
      command: 'pm clear com.example.app',
    });
    expect(agent.runAdbShell).toHaveBeenCalledWith(
      'dumpsys activity services',
      { timeout: 60000 },
    );
    expect(player.result.services).toBe('adb-result');
    expect(agent.callActionInActionSpace).toHaveBeenCalledWith('Launch', {
      uri: 'com.android.settings',
    });
    expect(agent.callActionInActionSpace).toHaveBeenCalledWith('Terminate', {
      uri: 'com.android.settings',
    });
    expect(agent.callActionInActionSpace).toHaveBeenCalledWith(
      'RunWdaRequest',
      {
        method: 'POST',
        endpoint: '/session/test/wda/pressButton',
        data: { name: 'home' },
        locate: undefined,
      },
    );
    expect(player.result.wda).toBe('action-result');
  });

  it('interpolates documented environment variables and rejects missing variables', () => {
    process.env.DOC_TOPIC = 'weather today';

    expect(interpolateEnvVars('- ai: Type ${DOC_TOPIC}\n')).toBe(
      '- ai: Type weather today\n',
    );
    expect(interpolateEnvVars('# ${DOC_TOPIC} stays in comments\n')).toBe(
      '# ${DOC_TOPIC} stays in comments\n',
    );
    expect(() => interpolateEnvVars('- ai: ${DOC_MISSING}\n')).toThrow(
      'Environment variable "DOC_MISSING" is not defined',
    );
  });

  it('keeps runtime result interpolation in tasks without hiding missing env vars in config', () => {
    expect(() =>
      parseYamlScript(`
web:
  url: https://example.com/\${DOC_MISSING}
tasks:
  - name: Env failure
    flow:
      - ai: This part is not reached
`),
    ).toThrow('Environment variable "DOC_MISSING" is not defined');

    const script = parseYamlScript(`
web:
  url: about:blank
tasks:
  - name: Runtime interpolation
    flow:
      - aiString: Read the product id
        name: product_id
      - aiQuery: Search for \${product_id}
        name: result
`);

    expect(script.tasks[0].flow[1]).toMatchObject({
      aiQuery: 'Search for ${product_id}',
    });
  });

  it('keeps Agent.runYaml scoped to the provided tasks', async () => {
    const agent = createDocAgent();
    const runYaml = Agent.prototype.runYaml.bind(agent);

    const result = await runYaml(`
web:
  url: https://example.com/ignored-by-existing-agent
agent:
  reportFileName: ignored-report-name
tasks:
  - name: Only tasks are executed
    flow:
      - ai: Run the task
      - aiString: Read the value
        name: value
`);

    expect(agent.aiAct).toHaveBeenCalledWith('Run the task', {});
    expect(result.result.value).toBe('SKU-123');
  });
});
