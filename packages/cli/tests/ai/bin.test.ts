import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getTmpFile } from '@midscene/core/utils';
import { uuid } from '@midscene/shared/utils';
import { describe, expect, test } from '@rstest/core';
import { execa } from 'execa';

const cliBin = require.resolve('../../bin/midscene');

const shouldRunAITest =
  process.platform !== 'linux' || process.env.AITEST === 'true';

const serverRoot = join(__dirname, '../server_root');

const saveYaml = async (yamlString: string) => {
  const tmpDir = tmpdir();
  const yamlPath = join(tmpDir, `ci_yaml_${uuid()}.yml`);
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

  test(
    'query with domIncluded',
    async () => {
      const output = getTmpFile('json');
      const yamlString = `
web:
  serve: ${serverRoot}
  url: products.html
  viewportWidth: 1000
  viewportHeight: 800
  output: ${output}

tasks:
  - name: extract items info
    flow:
      - aiQuery: >
          {name: string, price: number, actionBtnName: string, imageUrl: string}[], return all three products with their exact names, numeric prices, button labels, and image src URLs from the DOM. Do not omit any product.
        name: items
        domIncluded: true
      - aiAssert: The price of 'Trail Jacket' is 49.99
        name: price-assert

  - name: run javascript code
    flow:
      - javascript: >
          document.title
        name: page-title

    `;
      const path = await saveYaml(yamlString);
      const params = [path];
      // Terminate the CLI before the test timeout so a timed-out attempt cannot
      // continue making assertions while Rstest starts its retry.
      await execa(cliBin, params, { timeout: 240_000, killSignal: 'SIGKILL' });
      const result = JSON.parse(readFileSync(output!, 'utf-8'));
      const items = result.items
        .map(
          (item: {
            name: string;
            price: number;
            actionBtnName: string;
            imageUrl: string;
          }) => ({
            ...item,
            imageUrl: new URL(item.imageUrl, 'http://localhost').pathname,
          }),
        )
        .sort((a: { name: string }, b: { name: string }) =>
          a.name.localeCompare(b.name),
        );
      expect(items).toEqual([
        {
          name: 'Camp Light',
          price: 9.99,
          actionBtnName: 'Add to cart',
          imageUrl: '/products/light.svg',
        },
        {
          name: 'Trail Backpack',
          price: 29.99,
          actionBtnName: 'Add to cart',
          imageUrl: '/products/backpack.svg',
        },
        {
          name: 'Trail Jacket',
          price: 49.99,
          actionBtnName: 'Add to cart',
          imageUrl: '/products/jacket.svg',
        },
      ]);
      expect(result['page-title']).toBe('Trail Store');
      expect(result['price-assert'].thought).toBeTruthy();
      expect(result['price-assert'].pass).toBeTruthy();
    },
    5 * 60 * 1000,
  );

  test('yaml with image prompt', async () => {
    const params = ['./tests/midscene_scripts/online/image-prompting.yaml'];
    await execa(cliBin, params);
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
