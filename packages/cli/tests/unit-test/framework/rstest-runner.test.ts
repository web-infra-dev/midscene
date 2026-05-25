import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveRstestBinPath, runRstestCli } from '@/framework/rstest-runner';
import { describe, expect, test } from 'vitest';

const createTempDir = () => mkdtempSync(join(tmpdir(), 'midscene-rstest-cli-'));

describe('rstest runner', () => {
  test('resolves the bundled Rstest binary', () => {
    expect(resolveRstestBinPath()).toMatch(/@rstest[/\\]core/);
  });

  test('returns zero for a passing Rstest project and non-zero for a failing one', async () => {
    const root = createTempDir();
    const passing = join(root, 'passing.test.ts');
    const failing = join(root, 'failing.test.ts');
    const config = join(root, 'rstest.config.ts');

    try {
      writeFileSync(
        passing,
        "import { test, expect } from '@rstest/core';\ntest('pass', () => expect(1).toBe(1));\n",
      );
      writeFileSync(
        failing,
        "import { test, expect } from '@rstest/core';\ntest('fail', () => expect(1).toBe(2));\n",
      );
      writeFileSync(
        config,
        `import { defineConfig } from '@rstest/core';
export default defineConfig({
  root: ${JSON.stringify(root)},
  include: [${JSON.stringify(passing)}],
});
`,
      );

      await expect(
        runRstestCli({ configFile: config, cwd: root, stdio: 'pipe' }),
      ).resolves.toBe(0);

      writeFileSync(
        config,
        `import { defineConfig } from '@rstest/core';
export default defineConfig({
  root: ${JSON.stringify(root)},
  include: [${JSON.stringify(failing)}],
});
`,
      );

      await expect(
        runRstestCli({ configFile: config, cwd: root, stdio: 'pipe' }),
      ).resolves.not.toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
