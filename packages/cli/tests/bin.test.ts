import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execa } from 'execa';
import { describe, expect, test, vi } from 'vitest';

const cliBin = require.resolve('../bin/midscene');
vi.setConfig({
  testTimeout: 120 * 1000,
});

const shouldRunAITest =
  process.platform !== 'linux' || process.env.AITEST === 'true';

const serverRoot = join(__dirname, 'server_root');

const saveYaml = async (yamlString: string) => {
  const tmpDir = tmpdir();
  const yamlPath = join(tmpDir, `ci_yaml_${randomUUID()}.yml`);
  writeFileSync(yamlPath, yamlString);
  return yamlPath;
};

describe.skipIf(!shouldRunAITest)('bin', () => {
  test('local server', async () => {
    const yamlString = `
    target:
      serve: ${serverRoot}
      url: index.html
      viewportWidth: 300
      viewportHeight: 500
    tasks:
      - name: local page
        flow:
          - aiAssert: the content title is "My App"
  `;

    const path = await saveYaml(yamlString);
    const params = [path];
    await execa(cliBin, params);
  });

  test('local server - assertion failed', async () => {
    const yamlString = `
    target:
      serve: ${serverRoot}
      url: index.html
      viewportWidth: 300
      viewportHeight: 500
    tasks:
      - name: check content
        flow:
          - aiAssert: it shows the width is 888
    `;
    const path = await saveYaml(yamlString);
    const params = [path];
    await expect(async () => {
      await execa(cliBin, params);
    }).rejects.toThrow(/assertion/i);
  });

  test('run yaml scripts', async () => {
    const params = ['./tests/midscene_scripts'];
    await execa(cliBin, params);
  });

  test('run yaml scripts with keepWindow', async () => {
    const params = [
      './tests/midscene_scripts/online/bing.yaml',
      '--keep-window',
    ];
    await execa(cliBin, params);
  });

  test('run yaml scripts with headed, put options before path', async () => {
    const params = ['--headed', './tests/midscene_scripts/online/bing.yaml'];
    await execa(cliBin, params);
  });
});
