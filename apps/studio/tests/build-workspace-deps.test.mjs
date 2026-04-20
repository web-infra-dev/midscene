import { describe, expect, it, vi } from 'vitest';
import {
  buildWorkspaceDeps,
  shouldBuildWorkspaceDeps,
} from '../scripts/build-workspace-deps.mjs';

describe('shouldBuildWorkspaceDeps', () => {
  it('skips when Nx is already running the studio build target', () => {
    expect(
      shouldBuildWorkspaceDeps({
        NX_TASK_TARGET_PROJECT: 'studio',
        NX_TASK_TARGET_TARGET: 'build',
      }),
    ).toBe(false);
  });

  it('builds dependencies when the package build is invoked directly', () => {
    expect(shouldBuildWorkspaceDeps({})).toBe(true);
  });
});

describe('buildWorkspaceDeps', () => {
  it('invokes the playground-app dependency build from the workspace root', () => {
    const runner = vi.fn(() => ({ status: 0 }));

    expect(
      buildWorkspaceDeps({
        env: {},
        runner,
        workspaceRoot: '/repo',
      }),
    ).toBe(true);
    expect(runner).toHaveBeenCalledWith(
      'pnpm',
      [
        'exec',
        'nx',
        'run-many',
        '--target=build',
        '--projects',
        '@midscene/playground-app',
      ],
      expect.objectContaining({
        cwd: '/repo',
        stdio: 'inherit',
      }),
    );
  });

  it('throws when the dependency build exits non-zero', () => {
    const runner = vi.fn(() => ({ status: 1 }));

    expect(() =>
      buildWorkspaceDeps({
        env: {},
        runner,
      }),
    ).toThrow(/dependency build failed/i);
  });
});
