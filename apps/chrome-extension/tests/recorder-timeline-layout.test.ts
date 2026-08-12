import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from '@rstest/core';

describe('Chrome Recorder timeline layout', () => {
  it('removes the shared timeline height cap inside the detail modal', async () => {
    const styles = await readFile(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        '../src/extension/recorder/recorder.less',
      ),
      'utf8',
    );

    expect(styles).toMatch(
      /\.record-timeline-chrome-extension\s*\{[\s\S]*?\.timeline-scrollable,[\s\S]*?\.timeline-scrollable\s*>\s*div\s*\{[\s\S]*?max-height:\s*none;[\s\S]*?overflow-y:\s*visible;/,
    );
  });

  it('keeps the focused clear action inside the side-panel edge', async () => {
    const styles = await readFile(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        '../src/components/playground/index.less',
      ),
      'utf8',
    );

    expect(styles).toMatch(
      /\.chrome-extension-execution-timeline-skin\s*\{[\s\S]*?\.clear-button-container\s*\{[\s\S]*?right:\s*12px\s*!important;/,
    );
  });

  it('draws a high-contrast connector across adjacent progress rows', async () => {
    const styles = await readFile(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        '../src/components/playground/index.less',
      ),
      'utf8',
    );

    expect(styles).toMatch(
      /\.list-item:has\(\.progress-row\)\s*>\s*div:has\(>\s*\.progress-row\)::after\s*\{[\s\S]*?top:\s*23px;[\s\S]*?bottom:\s*-8px;[\s\S]*?left:\s*7px;[\s\S]*?width:\s*2px;/,
    );
    expect(styles).toMatch(
      /\[data-theme='dark'\]\s+\.chrome-extension-playground\s*\{[\s\S]*?--extension-timeline-connector:\s*#bfbfbf;/,
    );
  });
});
