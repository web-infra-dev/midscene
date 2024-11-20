import { execa } from 'execa';
import { describe, test, vi } from 'vitest';

const cliBin = require.resolve('../bin/midscene');
vi.setConfig({
  testTimeout: 120 * 1000,
});

const shouldRunAITest =
  process.platform !== 'linux' || process.env.AITEST === 'true';

describe.skipIf(!shouldRunAITest)('bin', () => {
  test('run yaml scripts', async () => {
    const params = ['./tests/midscene_scripts'];
    await execa(cliBin, params);
  });

  test.only('run yaml scripts with keepWindow', async () => {
    const params = ['./tests/midscene_scripts', '--keep-window'];
    await execa(cliBin, params);
  });
});
