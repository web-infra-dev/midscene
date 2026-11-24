import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from '@rstest/core';
import { freezeInputs } from '../scripts/frozen-inputs.mjs';

it('freezes config, helpers and fixtures; excludes an output directory inside the input project', () => {
  const root = mkdtempSync(join(tmpdir(), 'replay-inputs-'));
  try {
    writeFileSync(join(root, 'config.mjs'), 'export default {}');
    writeFileSync(join(root, 'fixture.json'), '{"expected":1}');
    const out = join(root, 'verification');
    mkdirSync(out);
    const frozen = freezeInputs(root, out);
    expect(Object.keys(frozen.files)).toEqual(['config.mjs', 'fixture.json']);
    frozen.unchanged();
    writeFileSync(join(root, 'fixture.json'), '{"expected":2}');
    expect(() => frozen.unchanged()).toThrow('VERIFY_INPUTS_CHANGED');
    expect(readFileSync(join(frozen.destination, 'fixture.json'), 'utf8')).toBe(
      '{"expected":1}',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it.each(['esm', 'cjs'])(
  'rejects live helper imports outside frozen inputs through %s',
  (format) => {
    const root = mkdtempSync(join(tmpdir(), 'replay-loader-'));
    try {
      const src = join(root, 'project');
      const out = join(root, 'output');
      mkdirSync(src);
      mkdirSync(out);
      const file = format === 'esm' ? 'step.mjs' : 'step.cjs';
      writeFileSync(
        join(src, file),
        format === 'esm' ? "import '../live.cjs';" : "require('../live.cjs');",
      );
      const frozen = freezeInputs(src, out);
      writeFileSync(join(out, 'live.cjs'), "throw new Error('MUST_NOT_RUN');");
      const loader = new URL('../scripts/verify-loader.mjs', import.meta.url)
        .href;
      const result = spawnSync(
        process.execPath,
        [
          '--input-type=module',
          '--eval',
          `
      import {register,createRequire} from 'node:module';
      import {guardCommonJs} from ${JSON.stringify(loader)};
      const manifest=${JSON.stringify({ destination: frozen.destination, files: frozen.files })};
      register(${JSON.stringify(loader)},{data:manifest}); guardCommonJs(manifest);
      ${format === 'esm' ? `await import(${JSON.stringify(join(frozen.destination, file))})` : `createRequire(import.meta.url)(${JSON.stringify(join(frozen.destination, file))})`};
    `,
        ],
        { encoding: 'utf8' },
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('VERIFY_IMPORT_OUTSIDE_INPUTS');
      expect(result.stderr).not.toContain('Error: MUST_NOT_RUN');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);
