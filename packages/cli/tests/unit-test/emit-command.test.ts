import type { EmitRstestProjectResult } from '@midscene/testing-framework';
import { describe, expect, it, vi } from 'vitest';
import { runEmitCommand } from '../../src/emit-command';

const fakeResult = (
  overrides: Partial<EmitRstestProjectResult> = {},
): EmitRstestProjectResult => ({
  outDir: '/abs/out',
  configFile: '/abs/out/midscene.config.ts',
  rstestConfigFile: '/abs/out/rstest.config.ts',
  packageJsonFile: '/abs/out/package.json',
  caseFiles: ['/abs/out/e2e/a.test.ts'],
  yamlFiles: ['/abs/out/e2e/a.yaml'],
  userTestFiles: [],
  ...overrides,
});

describe('runEmitCommand', () => {
  it('returns 1 and does not emit when the out-dir is missing', async () => {
    const emit = vi.fn();
    const code = await runEmitCommand(['--config', './midscene.config.ts'], {
      emit,
    });
    expect(code).toBe(1);
    expect(emit).not.toHaveBeenCalled();
  });

  it('emits to the positional out-dir with the --config path', async () => {
    const emit = vi.fn(async () => fakeResult());
    const code = await runEmitCommand(
      ['./out', '--config', './midscene.config.ts'],
      { emit },
    );
    expect(code).toBe(0);
    expect(emit).toHaveBeenCalledWith({
      outDir: './out',
      configPath: './midscene.config.ts',
    });
  });

  it('defaults configPath to undefined when --config is omitted', async () => {
    const emit = vi.fn(async () => fakeResult({ caseFiles: [] }));
    const code = await runEmitCommand(['./out'], { emit });
    expect(code).toBe(0);
    expect(emit).toHaveBeenCalledWith({
      outDir: './out',
      configPath: undefined,
    });
  });
});
