import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDefaultSetup,
  setupFrameworkAgent,
} from '../../src/runtime/setup';
import type { MidsceneFrameworkConfig } from '../../src/types';

const playwrightState = vi.hoisted(() => ({
  launchArgs: undefined as unknown,
  contextArgs: undefined as unknown,
  gotoUrl: undefined as unknown,
  contextClosed: false,
  browserClosed: false,
}));

const agentState = vi.hoisted(() => ({
  pageArg: undefined as unknown,
  optionsArg: undefined as unknown,
}));

const androidState = vi.hoisted(() => ({
  deviceId: undefined as unknown,
  options: undefined as unknown,
  launched: undefined as unknown,
  terminated: undefined as unknown,
}));

vi.mock('playwright', () => {
  const page = {
    goto: vi.fn(async (url: string) => {
      playwrightState.gotoUrl = url;
    }),
  };
  const context = {
    newPage: vi.fn(async () => page),
    close: vi.fn(async () => {
      playwrightState.contextClosed = true;
    }),
  };
  const browser = {
    newContext: vi.fn(async (args: unknown) => {
      playwrightState.contextArgs = args;
      return context;
    }),
    close: vi.fn(async () => {
      playwrightState.browserClosed = true;
    }),
  };
  return {
    chromium: {
      launch: vi.fn(async (args: unknown) => {
        playwrightState.launchArgs = args;
        return browser;
      }),
    },
  };
});

vi.mock('@midscene/web/playwright', () => ({
  PlaywrightAgent: class {
    constructor(page: unknown, options: unknown) {
      agentState.pageArg = page;
      agentState.optionsArg = options;
    }
    async runYaml() {
      return { result: {} };
    }
  },
}));

vi.mock('@midscene/android', () => ({
  agentFromAdbDevice: vi.fn(async (deviceId: unknown, options: unknown) => {
    androidState.deviceId = deviceId;
    androidState.options = options;
    return {
      async runYaml() {
        return { result: {} };
      },
      launch: vi.fn(async (target: unknown) => {
        androidState.launched = target;
      }),
      terminate: vi.fn(async (target: unknown) => {
        androidState.terminated = target;
      }),
    };
  }),
}));

beforeEach(() => {
  Object.assign(playwrightState, {
    launchArgs: undefined,
    contextArgs: undefined,
    gotoUrl: undefined,
    contextClosed: false,
    browserClosed: false,
  });
  Object.assign(agentState, { pageArg: undefined, optionsArg: undefined });
  Object.assign(androidState, {
    deviceId: undefined,
    options: undefined,
    launched: undefined,
    terminated: undefined,
  });
});

describe('createDefaultSetup web target', () => {
  const config: MidsceneFrameworkConfig = {
    testDir: './e2e',
    include: ['**/*.yaml'],
    target: {
      type: 'web',
      options: {
        url: 'http://127.0.0.1:3000/catalog.html',
        viewport: { width: 1280, height: 800 },
        headless: true,
      },
    },
    agentOptions: { cache: true, reportFileName: 'web-demo' },
  };

  it('launches chromium, navigates, and passes agentOptions', async () => {
    const result = await createDefaultSetup(config, {
      projectDir: '/tmp/project',
      agentOptions: config.agentOptions!,
    });

    expect(playwrightState.gotoUrl).toBe('http://127.0.0.1:3000/catalog.html');
    expect(playwrightState.contextArgs).toEqual({
      viewport: { width: 1280, height: 800 },
    });
    expect(agentState.pageArg).toBeDefined();
    expect(agentState.optionsArg).toEqual({
      cache: true,
      reportFileName: 'web-demo',
    });
    expect(result.agent).toBeDefined();
  });

  it('closes context and browser on teardown', async () => {
    const result = await createDefaultSetup(config, {
      projectDir: '/tmp/project',
      agentOptions: config.agentOptions!,
    });
    await result.teardown?.();
    expect(playwrightState.contextClosed).toBe(true);
    expect(playwrightState.browserClosed).toBe(true);
  });

  it('throws when url is missing', async () => {
    await expect(
      createDefaultSetup(
        {
          testDir: './e2e',
          include: ['**/*.yaml'],
          target: { type: 'web', options: {} },
        },
        { projectDir: '/tmp/project', agentOptions: {} },
      ),
    ).rejects.toThrow(/url is required/);
  });
});

describe('createDefaultSetup android target', () => {
  it('passes deviceId, launch, and device options through', async () => {
    const config: MidsceneFrameworkConfig = {
      testDir: './e2e',
      include: ['**/*.yaml'],
      target: {
        type: 'android',
        options: {
          deviceId: 'DEVICE-1',
          launch: 'com.example.app',
          androidAdbPath: '/opt/adb',
          autoDismissKeyboard: false,
        },
      },
      agentOptions: { cache: true },
    };

    const result = await createDefaultSetup(config, {
      projectDir: '/tmp/project',
      agentOptions: config.agentOptions!,
    });

    expect(androidState.deviceId).toBe('DEVICE-1');
    expect(androidState.options).toEqual({
      cache: true,
      androidAdbPath: '/opt/adb',
      autoDismissKeyboard: false,
    });
    expect(androidState.launched).toBe('com.example.app');

    await result.teardown?.();
    expect(androidState.terminated).toBe('com.example.app');
  });

  it('does not terminate http launch targets', async () => {
    const config: MidsceneFrameworkConfig = {
      testDir: './e2e',
      include: ['**/*.yaml'],
      target: {
        type: 'android',
        options: { launch: 'https://www.ebay.com' },
      },
    };

    const result = await createDefaultSetup(config, {
      projectDir: '/tmp/project',
      agentOptions: {},
    });
    expect(androidState.launched).toBe('https://www.ebay.com');
    await result.teardown?.();
    expect(androidState.terminated).toBeUndefined();
  });
});

describe('setupFrameworkAgent', () => {
  it('prefers a custom setup over the default target', async () => {
    const customAgent = { runYaml: vi.fn(async () => ({ result: {} })) };
    const setup = vi.fn(async () => ({ agent: customAgent }));
    const result = await setupFrameworkAgent(
      {
        testDir: './e2e',
        include: ['**/*.yaml'],
        setup,
      },
      { projectDir: '/tmp/project', agentOptions: { headed: false } },
    );

    expect(setup).toHaveBeenCalledWith({
      projectDir: '/tmp/project',
      agentOptions: { headed: false },
    });
    expect(result.agent).toBe(customAgent);
  });

  it('resolves cache:true to a stable id derived from the project folder', async () => {
    const setup = vi.fn(async () => ({ agent: { runYaml: vi.fn() } }));
    await setupFrameworkAgent(
      { testDir: './e2e', include: ['**/*.yaml'], setup },
      { projectDir: '/work/my-smoke-suite', agentOptions: { cache: true } },
    );
    expect(setup).toHaveBeenCalledWith({
      projectDir: '/work/my-smoke-suite',
      agentOptions: { cache: { id: 'my-smoke-suite' } },
    });
  });

  it('leaves an explicit cache id (or cache:false) untouched', async () => {
    const setup = vi.fn(async () => ({ agent: { runYaml: vi.fn() } }));
    await setupFrameworkAgent(
      { testDir: './e2e', include: ['**/*.yaml'], setup },
      {
        projectDir: '/work/proj',
        agentOptions: { cache: { id: 'fixed' } },
      },
    );
    await setupFrameworkAgent(
      { testDir: './e2e', include: ['**/*.yaml'], setup },
      { projectDir: '/work/proj', agentOptions: { cache: false } },
    );
    expect(setup).toHaveBeenNthCalledWith(1, {
      projectDir: '/work/proj',
      agentOptions: { cache: { id: 'fixed' } },
    });
    expect(setup).toHaveBeenNthCalledWith(2, {
      projectDir: '/work/proj',
      agentOptions: { cache: false },
    });
  });
});
