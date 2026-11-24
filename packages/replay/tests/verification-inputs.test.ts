import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, win32 } from 'node:path';
import { expect, it } from '@rstest/core';
import { freezeInputs, within } from '../scripts/frozen-inputs.mjs';

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

it.each([
  "import '../live.cjs'",
  "export * from '../live.cjs'",
  "await import('../live.cjs')",
  "require('../live.cjs')",
  "module.require('../live.cjs')",
])('rejects live helper imports before copying: %s', (source) => {
  const root = mkdtempSync(join(tmpdir(), 'replay-loader-'));
  try {
    const src = join(root, 'project');
    const out = join(root, 'output');
    mkdirSync(src);
    mkdirSync(out);
    writeFileSync(join(src, 'step.mjs'), source);
    expect(() => freezeInputs(src, out)).toThrow(
      'VERIFY_IMPORT_OUTSIDE_INPUTS',
    );
    expect(existsSync(join(out, 'inputs'))).toBe(false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it('keeps TS helpers and fixture data, ignores import-like strings, and rejects computed imports', () => {
  const root = mkdtempSync(join(tmpdir(), 'replay-imports-'));
  const out = join(root, 'verification');
  mkdirSync(out);
  try {
    writeFileSync(join(root, 'helper.ts'), 'export const value: number = 1');
    writeFileSync(join(root, 'fixture.json'), '{"expected":1}');
    writeFileSync(
      join(root, 'config.ts'),
      `import {value} from './helper.js'; const text = "import '../not-code.js'"; export default {value, text};`,
    );
    const frozen = freezeInputs(root, out);
    expect(Object.keys(frozen.files)).toEqual([
      'config.ts',
      'fixture.json',
      'helper.ts',
    ]);
    writeFileSync(
      join(frozen.destination, 'helper.ts'),
      'export const value = 2',
    );
    expect(() => frozen.unchanged()).toThrow('VERIFY_INPUTS_CHANGED');
    writeFileSync(
      join(root, 'config.ts'),
      'const path = "./helper.ts"; await import(path);',
    );
    expect(() => freezeInputs(root, out)).toThrow('VERIFY_DYNAMIC_IMPORT');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it.each(['pnpm-workspace.yaml', 'package.json'])(
  'rejects a workspace root before traversing or copying files: %s',
  (marker) => {
    const root = mkdtempSync(join(tmpdir(), 'replay-monorepo-'));
    const out = join(root, 'verification');
    mkdirSync(out);
    try {
      writeFileSync(
        join(root, marker),
        marker.endsWith('json')
          ? '{"workspaces":["packages/*"]}'
          : 'packages: [packages/*]',
      );
      expect(() => freezeInputs(root, out)).toThrow('VERIFY_PROJECT_TOO_BROAD');
      expect(existsSync(join(out, 'inputs'))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

it('rejects sibling and cross-drive paths on Windows', () => {
  expect(within('C:\\project', 'C:\\project\\steps\\run.mjs', win32)).toBe(
    true,
  );
  expect(within('C:\\project', 'C:\\project-sibling\\run.mjs', win32)).toBe(
    false,
  );
  expect(within('C:\\project', 'D:\\run.mjs', win32)).toBe(false);
});

it.each(['../outside.mjs', '{script: ../outside.mjs}'])(
  'rejects YAML replay entry points outside the snapshot: %s',
  (replay) => {
    const root = mkdtempSync(join(tmpdir(), 'replay-yaml-inputs-'));
    const out = join(root, 'verification');
    mkdirSync(out);
    try {
      const yaml = `cases:\n  - name: local\n    steps:\n      - aiAct:\n          prompt: act\n          replay: ${replay}\n`;
      writeFileSync(join(root, 'case.yaml'), yaml);
      expect(() => freezeInputs(root, out)).toThrow(
        'VERIFY_IMPORT_OUTSIDE_INPUTS',
      );
      expect(existsSync(join(out, 'inputs'))).toBe(false);
      writeFileSync(
        join(root, 'case.yaml'),
        yaml.replaceAll('../outside.mjs', 'step.mjs'),
      );
      writeFileSync(join(root, 'step.mjs'), 'export default {run(){}}');
      expect(Object.keys(freezeInputs(root, out).files)).toEqual([
        'case.yaml',
        'step.mjs',
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);
