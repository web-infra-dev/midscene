import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getTmpFile } from '@midscene/core/utils';
import { execa } from 'execa';
import { describe, expect, test, vi } from 'vitest';

const cliBin = require.resolve('../../bin/midscene');
vi.setConfig({
  testTimeout: 120 * 1000,
});

const shouldRunAITest =
  process.platform !== 'linux' || process.env.AITEST === 'true';

const serverRoot = join(__dirname, '../server_root');

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

  test('local server - evaluateJavaScript', async () => {
    const output = getTmpFile('json');
    const yamlString = `
    target:
      serve: ${serverRoot}
      url: index.html
      viewportWidth: 300
      viewportHeight: 500
      output: ${output}
    tasks:
      - name: check content
        flow:
          - javascript: |
              (function() {
                return 'bar'
              })()
            name: foo

          - javascript: |
              (new Promise((resolve) => {
                setTimeout(() => {
                  resolve('hello')
                }, 1000)
              }))
            name: promise
    `;
    const path = await saveYaml(yamlString);
    const params = [path];
    await execa(cliBin, params);
    const result = JSON.parse(readFileSync(output!, 'utf-8'));
    expect(result).toMatchSnapshot();
  });

  test('run yaml scripts', async () => {
    const params = ['./tests/midscene_scripts/local/local.yml'];
    await execa(cliBin, params);
  });

  test('query with domIncluded', async () => {
    const output = getTmpFile('json');
    const yamlString = `
    # login to sauce demo, extract the items info into a json file, and assert the price of 'Sauce Labs Fleece Jacket'

web:
  url: https://www.saucedemo.com/
  output: ${output}

tasks:
  - name: login
    flow:
      - aiAction: type 'standard_user' in user name input, type 'secret_sauce' in password, click 'Login'

  - name: extract items info
    flow:
      - aiQuery: >
          {name: string, price: number, actionBtnName: string, imageUrl: string}[], return item name, price and the action button name on the lower right corner of each item, and the image url of each item (like 'Remove')
        name: items
        domIncluded: true
      - aiAssert: The price of 'Sauce Labs Fleece Jacket' is 49.99

  - name: run javascript code
    flow:
      - javascript: >
          document.title
        name: page-title

    `;
    const path = await saveYaml(yamlString);
    const params = [path];
    await execa(cliBin, params);
    const result = JSON.parse(readFileSync(output!, 'utf-8'));
    expect(result.items.length).toBeGreaterThanOrEqual(2);
    expect(result.items[0].imageUrl).toContain('/static/media/');
    expect(result).toMatchSnapshot();
  });

  test.skip('run yaml scripts with keepWindow', async () => {
    const params = [
      './tests/midscene_scripts/online/online.yaml',
      '--keep-window',
    ];
    await execa(cliBin, params);
  });

  test.skip('run yaml scripts with headed, put options before path', async () => {
    const params = ['--headed', './tests/midscene_scripts/online/online.yaml'];
    await execa(cliBin, params);
  });

  test('run yaml scripts when set aiAssert errorMessage', async () => {
    const params = ['./tests/midscene_scripts/local/local-error-message.yml'];
    await expect(async () => {
      await execa(cliBin, params);
    }).rejects.toThrow(/something error when assert title/i);
  });
});
