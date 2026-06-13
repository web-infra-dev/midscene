/**
 * Unit tests for createUiAgent's per-type construction. Every platform
 * module is mocked — no browser, no devices. The mocks assert constructor
 * wiring: option threading (uiAgentOptions + generateReport default),
 * launch handling, cleanup, and the missing-package error.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createUiAgent,
  importPlatformPackage,
} from '../../src/agents/ui-agent';
import type { ResolvedBddConfig, UiAgentOptions } from '../../src/types';

const mocks = vi.hoisted(() => {
  const makeDeviceAgent = () => ({
    launch: vi.fn(async () => {}),
    destroy: vi.fn(async () => {}),
    reportFile: null,
  });
  return {
    webAgent: { reportFile: '/tmp/web-report.html' },
    webFreeFn: [] as { name: string; fn: () => void }[],
    puppeteerAgentForTarget: vi.fn(),
    androidAgent: makeDeviceAgent(),
    agentFromAdbDevice: vi.fn(),
    iosAgent: makeDeviceAgent(),
    agentFromWebDriverAgent: vi.fn(),
    harmonyAgent: makeDeviceAgent(),
    agentFromHdcDevice: vi.fn(),
    computerAgent: makeDeviceAgent(),
    agentForComputer: vi.fn(),
    createAgent: vi.fn(),
    makeDeviceAgent,
  };
});

vi.mock('@midscene/web/puppeteer-agent-launcher', () => ({
  puppeteerAgentForTarget: mocks.puppeteerAgentForTarget,
}));
vi.mock('@midscene/android', () => ({
  agentFromAdbDevice: mocks.agentFromAdbDevice,
}));
vi.mock('@midscene/ios', () => ({
  agentFromWebDriverAgent: mocks.agentFromWebDriverAgent,
}));
vi.mock('@midscene/harmony', () => ({
  agentFromHdcDevice: mocks.agentFromHdcDevice,
}));
vi.mock('@midscene/computer', () => ({
  agentForComputer: mocks.agentForComputer,
}));
vi.mock('@midscene/core/agent', () => ({
  createAgent: mocks.createAgent,
}));

const tmpDirs: string[] = [];

function makeConfig(
  uiAgent: ResolvedBddConfig['uiAgent'],
  uiAgentOptions?: UiAgentOptions,
  baseDir = '/tmp/project',
): ResolvedBddConfig {
  return {
    uiAgent,
    uiAgentOptions,
    generalAgent: {},
    paths: { features: ['features/**/*.feature'], skills: 'features/skills' },
    baseDir,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.webFreeFn.length = 0;
  mocks.puppeteerAgentForTarget.mockResolvedValue({
    agent: mocks.webAgent,
    freeFn: mocks.webFreeFn,
  });
  mocks.agentFromAdbDevice.mockResolvedValue(mocks.androidAgent);
  mocks.agentFromWebDriverAgent.mockResolvedValue(mocks.iosAgent);
  mocks.agentFromHdcDevice.mockResolvedValue(mocks.harmonyAgent);
  mocks.agentForComputer.mockResolvedValue(mocks.computerAgent);
});

afterEach(() => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe('web target', () => {
  it('passes target fields and defaults generateReport to true', async () => {
    const { agent } = await createUiAgent(
      makeConfig({
        type: 'web',
        url: 'https://example.com',
        viewportWidth: 1280,
      }),
    );

    expect(agent).toBe(mocks.webAgent);
    // objectContaining: the behavior worth pinning is "configured fields
    // arrive", not how absent options are spelled internally.
    expect(mocks.puppeteerAgentForTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://example.com',
        viewportWidth: 1280,
      }),
      { headed: false, keepWindow: false, generateReport: true },
    );
  });

  it('threads uiAgentOptions through (overriding the generateReport default)', async () => {
    await createUiAgent(
      makeConfig(
        { type: 'web', url: 'https://example.com', headed: true },
        { generateReport: false, groupName: 'Checkout' },
      ),
    );

    expect(mocks.puppeteerAgentForTarget).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://example.com' }),
      {
        headed: true,
        keepWindow: false,
        generateReport: false,
        groupName: 'Checkout',
      },
    );
  });

  it('cleanup runs the launcher freeFns in reverse order', async () => {
    const order: string[] = [];
    mocks.webFreeFn.push(
      { name: 'browser', fn: () => order.push('browser') },
      { name: 'agent', fn: () => order.push('agent') },
    );

    const { cleanup } = await createUiAgent(
      makeConfig({ type: 'web', url: 'https://example.com' }),
    );
    await cleanup?.();

    expect(order).toEqual(['agent', 'browser']);
  });
});

describe('android target', () => {
  it('wires deviceId, device passthrough fields and agent options', async () => {
    const { agent, cleanup } = await createUiAgent(
      makeConfig(
        {
          type: 'android',
          deviceId: 'emulator-5554',
          androidAdbPath: '/opt/adb',
        },
        { groupName: 'Android suite' },
      ),
    );

    expect(agent).toBe(mocks.androidAgent);
    expect(mocks.agentFromAdbDevice).toHaveBeenCalledWith('emulator-5554', {
      androidAdbPath: '/opt/adb',
      generateReport: true,
      groupName: 'Android suite',
    });
    expect(mocks.androidAgent.launch).not.toHaveBeenCalled();

    await cleanup?.();
    expect(mocks.androidAgent.destroy).toHaveBeenCalledTimes(1);
  });

  it('launches the app after creation when launch is set', async () => {
    await createUiAgent(
      makeConfig({ type: 'android', launch: 'com.example.app' }),
    );

    expect(mocks.agentFromAdbDevice).toHaveBeenCalledWith(undefined, {
      generateReport: true,
    });
    expect(mocks.androidAgent.launch).toHaveBeenCalledWith('com.example.app');
  });
});

describe('ios target', () => {
  it('wires device passthrough fields (incl. deviceId) and launch', async () => {
    const { agent, cleanup } = await createUiAgent(
      makeConfig({
        type: 'ios',
        deviceId: 'UDID-1',
        wdaPort: 8200,
        launch: 'com.example.app',
      }),
    );

    expect(agent).toBe(mocks.iosAgent);
    expect(mocks.agentFromWebDriverAgent).toHaveBeenCalledWith({
      deviceId: 'UDID-1',
      wdaPort: 8200,
      generateReport: true,
    });
    expect(mocks.iosAgent.launch).toHaveBeenCalledWith('com.example.app');

    await cleanup?.();
    expect(mocks.iosAgent.destroy).toHaveBeenCalledTimes(1);
  });
});

describe('harmony target', () => {
  it('wires deviceId and launch', async () => {
    await createUiAgent(
      makeConfig({ type: 'harmony', deviceId: 'hdc-1', launch: 'com.app' }),
    );

    expect(mocks.agentFromHdcDevice).toHaveBeenCalledWith('hdc-1', {
      generateReport: true,
    });
    expect(mocks.harmonyAgent.launch).toHaveBeenCalledWith('com.app');
  });

  it('a missing platform package fails naming the package to install', async () => {
    // vi.mock factory results are cached per registry, so simulating a
    // missing package needs vi.doMock + a FRESH import of the module under
    // test (resetModules makes the dynamic import re-resolve).
    // The import-failure classification is tested directly below
    // (importPlatformPackage): vitest wraps errors thrown from doMock
    // factories in its own error, so Node's real ERR_MODULE_NOT_FOUND shape
    // cannot be simulated through the public import path. This test pins
    // only the wiring: an import failure surfaces and no agent is built.
    vi.resetModules();
    vi.doMock('@midscene/harmony', () => {
      throw Object.assign(new Error("Cannot find module '@midscene/harmony'"), {
        code: 'ERR_MODULE_NOT_FOUND',
      });
    });
    try {
      const { createUiAgent: freshCreateUiAgent } = await import(
        '../../src/agents/ui-agent'
      );
      await expect(
        freshCreateUiAgent(makeConfig({ type: 'harmony' })),
      ).rejects.toThrow();
      expect(mocks.agentFromHdcDevice).not.toHaveBeenCalled();
    } finally {
      vi.doUnmock('@midscene/harmony');
      vi.resetModules();
    }
  });
});

describe('importPlatformPackage', () => {
  it('translates a genuine resolution failure into the install hint', async () => {
    const notFound = Object.assign(
      new Error("Cannot find package '@midscene/harmony' imported from x"),
      { code: 'ERR_MODULE_NOT_FOUND' },
    );
    await expect(
      importPlatformPackage('harmony', () => Promise.reject(notFound)),
    ).rejects.toThrow(
      /uiAgent type 'harmony' requires the optional peer dependency '@midscene\/harmony' — install it \(e\.g\. `pnpm add -D @midscene\/harmony`\)/,
    );
  });

  it('rethrows an installed-but-broken package untouched', async () => {
    // Not a resolution failure (native build breakage, broken transitive
    // dep) — must not be misdiagnosed as a missing install.
    await expect(
      importPlatformPackage('harmony', () =>
        Promise.reject(new Error('hdc native binding failed to load')),
      ),
    ).rejects.toThrow(/hdc native binding failed to load/);
  });

  it('rethrows a resolution failure of a TRANSITIVE dep untouched', async () => {
    const transitive = Object.assign(
      new Error(
        "Cannot find package 'left-pad' imported from @midscene/harmony",
      ),
      { code: 'ERR_MODULE_NOT_FOUND' },
    );
    await expect(
      importPlatformPackage('harmony', () => Promise.reject(transitive)),
    ).rejects.toThrow(/left-pad/);
  });
});

describe('computer target', () => {
  it('wires displayId and agent options', async () => {
    const { agent } = await createUiAgent(
      makeConfig({ type: 'computer', displayId: '2' }),
    );

    expect(agent).toBe(mocks.computerAgent);
    expect(mocks.agentForComputer).toHaveBeenCalledWith({
      displayId: '2',
      generateReport: true,
    });
  });
});

describe('interface target', () => {
  function writeDeviceModule(contents: string): string {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'midscene-bdd-ui-agent-'));
    tmpDirs.push(dir);
    writeFileSync(path.join(dir, 'device.mjs'), contents);
    return dir;
  }

  it('imports the module relative to baseDir and wires createAgent', async () => {
    const baseDir = writeDeviceModule(
      'export default class FakeDevice { constructor(param) { this.param = param; } }\n',
    );
    const coreAgent = mocks.makeDeviceAgent();
    mocks.createAgent.mockReturnValue(coreAgent);

    const { agent, cleanup } = await createUiAgent(
      makeConfig(
        { type: 'interface', module: './device.mjs', param: { token: 'x' } },
        { cache: { id: 'my-cache' } },
        baseDir,
      ),
    );

    expect(agent).toBe(coreAgent);
    expect(mocks.createAgent).toHaveBeenCalledTimes(1);
    const [device, options] = mocks.createAgent.mock.calls[0];
    expect(device.param).toEqual({ token: 'x' });
    expect(options).toEqual({
      generateReport: true,
      cache: { id: 'my-cache' },
    });

    await cleanup?.();
    expect(coreAgent.destroy).toHaveBeenCalledTimes(1);
  });

  it('uses the named export when configured', async () => {
    const baseDir = writeDeviceModule(
      'export class MyDevice { constructor(param) { this.param = param; } }\n',
    );
    mocks.createAgent.mockReturnValue(mocks.makeDeviceAgent());

    await createUiAgent(
      makeConfig(
        { type: 'interface', module: './device.mjs', export: 'MyDevice' },
        undefined,
        baseDir,
      ),
    );

    const [device] = mocks.createAgent.mock.calls[0];
    expect(device.constructor.name).toBe('MyDevice');
  });

  it('fails with the resolved path when the module cannot be imported', async () => {
    await expect(
      createUiAgent(
        makeConfig(
          { type: 'interface', module: './missing.mjs' },
          undefined,
          '/tmp/definitely-not-there',
        ),
      ),
    ).rejects.toThrow(
      /uiAgent interface module '\.\/missing\.mjs' \(resolved: '\/tmp\/definitely-not-there\/missing\.mjs'\) could not be imported/,
    );
  });

  it('fails when the export is not constructable', async () => {
    const baseDir = writeDeviceModule('export const MyDevice = 42;\n');

    await expect(
      createUiAgent(
        makeConfig(
          { type: 'interface', module: './device.mjs', export: 'MyDevice' },
          undefined,
          baseDir,
        ),
      ),
    ).rejects.toThrow(/did not provide a constructable export 'MyDevice'/);
  });
});
