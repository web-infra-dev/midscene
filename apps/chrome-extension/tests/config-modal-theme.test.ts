import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appRoot = dirname(fileURLToPath(import.meta.url));

describe('Chrome Config modal theme', () => {
  it('keeps Config as a light surface inside the dark extension shell', async () => {
    const [popupStyles, configModalStyles] = await Promise.all([
      readFile(resolve(appRoot, '../src/extension/popup/index.less'), 'utf8'),
      readFile(
        resolve(
          appRoot,
          '../../../packages/visualizer/src/component/config-modal/index.less',
        ),
        'utf8',
      ),
    ]);

    expect(popupStyles).toMatch(
      /html\[data-theme='dark'\]\s*\{[\s\S]*?--midscene-text-primary:\s*rgba\(255, 255, 255, 0\.88\);[\s\S]*?--midscene-text-placeholder:[\s\S]*?--midscene-border-control:[\s\S]*?--midscene-divider:/,
    );
    expect(popupStyles).toMatch(
      /html\[data-theme='dark'\]\s+\.chrome-extension-model-env-config-modal\s*\{[\s\S]*?--midscene-surface:\s*#fff;[\s\S]*?--midscene-text-primary:\s*#0d0d0d;[\s\S]*?--midscene-text-secondary:\s*rgba\(0, 0, 0, 0\.7\);[\s\S]*?--midscene-border-control:\s*#dadada;/,
    );
    expect(configModalStyles).toContain(
      "[data-theme='dark'] .midscene-config-modal",
    );
    expect(configModalStyles).toMatch(
      /\.ant-modal-content\s*\{[\s\S]*?background-color:\s*var\(--midscene-surface-elevated/,
    );
    expect(configModalStyles).toMatch(
      /\.ant-modal-title,[\s\S]*?\.ant-typography,[\s\S]*?color:\s*var\(--midscene-text-primary/,
    );
    expect(configModalStyles).toMatch(
      /\.ant-input,[\s\S]*?\.ant-select-selector\s*\{[\s\S]*?background-color:\s*var\(--midscene-surface/,
    );
  });

  it('uses a compact first viewport that reaches the Agent option heading', async () => {
    const popupStyles = await readFile(
      resolve(appRoot, '../src/extension/popup/index.less'),
      'utf8',
    );

    const configModalScope = popupStyles.slice(
      popupStyles.indexOf('.chrome-extension-model-env-config-modal'),
    );

    expect(configModalScope).toMatch(
      /\.midscene-config-modal-env-textarea\s*\{[\s\S]*?min-height:\s*160px\s*!important;/,
    );
    expect(configModalScope).toMatch(
      /\.midscene-config-modal-body-content,[\s\S]*?\.midscene-config-modal-env-section,[\s\S]*?\.midscene-config-modal-agent-options\s*\{[\s\S]*?gap:\s*12px;/,
    );
  });
});
