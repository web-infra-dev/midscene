import path from 'node:path';
import { beforeEach, describe, expect, it, rs } from '@rstest/core';

const mocks = rs.hoisted(() => ({
  buildStudioRuntimeEnv: rs.fn(),
  spawn: rs.fn(),
}));

rs.mock('node:child_process', () => ({
  spawn: mocks.spawn,
}));

rs.mock('node:module', () => ({
  createRequire: () => (specifier: string) => {
    if (specifier !== 'electron') {
      throw new Error(`Unexpected require: ${specifier}`);
    }
    return '/mock/bin/electron';
  },
}));

rs.mock('../scripts/runtime-env.mjs', () => ({
  buildStudioRuntimeEnv: mocks.buildStudioRuntimeEnv,
}));

rs.mock('../scripts/renderer-dev-config.mjs', () => ({
  rendererDevUrl: 'http://127.0.0.1:3210',
}));

function createMockChildProcess() {
  const eventHandlers = new Map<string, (...args: unknown[]) => void>();
  const child = {
    killed: false,
    kill: rs.fn((signal?: NodeJS.Signals | number) => {
      child.killed = true;
      return signal !== undefined;
    }),
    on: rs.fn((event: string, handler: (...args: unknown[]) => void) => {
      eventHandlers.set(event, handler);
      return child;
    }),
  };

  return { child, eventHandlers };
}

async function loadLaunchScript(
  relativeModulePath:
    | '../scripts/launch-electron-dev.mjs'
    | '../scripts/launch-electron-prod.mjs',
) {
  rs.resetModules();

  const { child, eventHandlers } = createMockChildProcess();
  const processHandlers = new Map<string, (...args: unknown[]) => void>();

  mocks.spawn.mockReturnValue(child);
  mocks.buildStudioRuntimeEnv.mockImplementation(
    ({
      overrides,
      studioRootDir,
    }: {
      overrides?: Record<string, string>;
      studioRootDir: string;
    }) => ({
      BUILT_ENV: '1',
      ...(overrides ?? {}),
      STUDIO_ROOT_DIR: studioRootDir,
    }),
  );

  const processOnSpy = rs.spyOn(process, 'on').mockImplementation(((
    event,
    handler,
  ) => {
    processHandlers.set(String(event), handler as (...args: unknown[]) => void);
    return process;
  }) as typeof process.on);
  const processExitSpy = rs.spyOn(process, 'exit').mockImplementation(((
    code?: string | number | null,
  ) => {
    throw new Error(`process.exit:${String(code ?? 0)}`);
  }) as never);
  const processKillSpy = rs
    .spyOn(process, 'kill')
    .mockImplementation(
      ((pid: number, signal?: NodeJS.Signals | number) =>
        pid === process.pid && signal !== undefined) as typeof process.kill,
    );

  // Import the launch script through statically-analyzable string-literal
  // imports (there are only the two scripts named in this function's parameter
  // type). This is required, not a temporary shim: test mocks are injected via
  // an rspack build-time transform, so a dynamic `import(variable)` would escape
  // the transform and load the module via Node's native ESM loader — bypassing
  // rs.mock('node:child_process') etc. and spawning a REAL Electron process.
  if (relativeModulePath === '../scripts/launch-electron-dev.mjs') {
    // @ts-expect-error dev-only .mjs launch script ships no type declaration
    await import('../scripts/launch-electron-dev.mjs');
  } else {
    // @ts-expect-error prod-only .mjs launch script ships no type declaration
    await import('../scripts/launch-electron-prod.mjs');
  }

  processOnSpy.mockRestore();

  return {
    child,
    childEventHandlers: eventHandlers,
    processExitSpy,
    processHandlers,
    processKillSpy,
  };
}

describe('Electron launch scripts', () => {
  beforeEach(() => {
    rs.restoreAllMocks();
    rs.clearAllMocks();
    rs.unstubAllEnvs();
  });

  it('launches the dev entrypoint with an inspector and renderer URL override', async () => {
    const { child, childEventHandlers, processExitSpy, processHandlers } =
      await loadLaunchScript('../scripts/launch-electron-dev.mjs');

    expect(mocks.buildStudioRuntimeEnv).toHaveBeenCalledWith(
      expect.objectContaining({
        baseEnv: process.env,
        overrides: {
          MIDSCENE_STUDIO_RENDERER_URL: 'http://127.0.0.1:3210',
        },
        studioRootDir: expect.stringContaining(path.join('apps', 'studio')),
      }),
    );

    expect(mocks.spawn).toHaveBeenCalledWith(
      '/mock/bin/electron',
      [
        '--inspect=9229',
        expect.stringContaining(path.join('dist', 'main', 'main.cjs')),
      ],
      {
        env: {
          BUILT_ENV: '1',
          MIDSCENE_STUDIO_RENDERER_URL: 'http://127.0.0.1:3210',
          STUDIO_ROOT_DIR: expect.stringContaining(path.join('apps', 'studio')),
        },
        stdio: 'inherit',
      },
    );

    processHandlers.get('SIGINT')?.('SIGINT');
    expect(child.kill).toHaveBeenCalledWith('SIGINT');

    child.killed = false;
    expect(() => childEventHandlers.get('exit')?.(7, null)).toThrow(
      'process.exit:7',
    );
    expect(processExitSpy).toHaveBeenCalledWith(7);
  });

  it('allows opting out of the dev inspector port', async () => {
    rs.stubEnv('MIDSCENE_STUDIO_MAIN_INSPECT', '0');

    await loadLaunchScript('../scripts/launch-electron-dev.mjs');

    expect(mocks.spawn).toHaveBeenCalledWith(
      '/mock/bin/electron',
      [expect.stringContaining(path.join('dist', 'main', 'main.cjs'))],
      expect.any(Object),
    );
  });

  it('launches the production entrypoint without a renderer override and forwards exit signals', async () => {
    const { childEventHandlers, processKillSpy } = await loadLaunchScript(
      '../scripts/launch-electron-prod.mjs',
    );

    expect(mocks.buildStudioRuntimeEnv).toHaveBeenCalledWith(
      expect.objectContaining({
        baseEnv: process.env,
        studioRootDir: expect.stringContaining(path.join('apps', 'studio')),
      }),
    );
    expect(mocks.spawn).toHaveBeenCalledWith(
      '/mock/bin/electron',
      [expect.stringContaining(path.join('dist', 'main', 'main.cjs'))],
      {
        env: {
          BUILT_ENV: '1',
          STUDIO_ROOT_DIR: expect.stringContaining(path.join('apps', 'studio')),
        },
        stdio: 'inherit',
      },
    );

    childEventHandlers.get('exit')?.(null, 'SIGTERM');
    expect(processKillSpy).toHaveBeenCalledWith(process.pid, 'SIGTERM');
  });
});
