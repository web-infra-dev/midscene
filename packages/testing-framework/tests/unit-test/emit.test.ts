import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { emitRstestProject } from '../../src/emit';

const createSourceProject = (configBody: string): string => {
  const root = mkdtempSync(join(tmpdir(), 'midscene-emit-'));
  writeFileSync(join(root, 'midscene.config.ts'), configBody);
  const e2e = join(root, 'e2e');
  mkdirSync(e2e, { recursive: true });
  writeFileSync(join(e2e, 'a.yaml'), 'flow:\n  - aiAct: do a\n');
  writeFileSync(join(e2e, 'b.yaml'), 'flow:\n  - aiAct: do b\n');
  return root;
};

describe('emitRstestProject', () => {
  it('writes a self-contained native rstest project', async () => {
    const root = createSourceProject(
      "export default { testDir: './e2e', include: ['**/*.yaml'], testRunner: { testTimeout: 120000 } };\n",
    );
    const outDir = join(root, 'out');

    const result = await emitRstestProject({
      configPath: join(root, 'midscene.config.ts'),
      outDir,
    });

    // Top-level project files.
    expect(existsSync(join(outDir, 'midscene.config.ts'))).toBe(true);
    expect(existsSync(join(outDir, 'rstest.config.ts'))).toBe(true);
    expect(existsSync(join(outDir, 'package.json'))).toBe(true);

    // YAML copied + a generated test per case.
    expect(existsSync(join(outDir, 'e2e', 'a.yaml'))).toBe(true);
    expect(existsSync(join(outDir, 'e2e', 'a.test.ts'))).toBe(true);
    expect(existsSync(join(outDir, 'e2e', 'b.test.ts'))).toBe(true);
    expect(result.caseFiles).toHaveLength(2);

    const caseSource = readFileSync(join(outDir, 'e2e', 'a.test.ts'), 'utf8');
    expect(caseSource).toContain('import config from "../midscene.config"');
    expect(caseSource).toContain('defineMidsceneCaseTest');
    expect(caseSource).toContain('resolve(__dirname, "a.yaml")');

    const rstestConfig = readFileSync(join(outDir, 'rstest.config.ts'), 'utf8');
    expect(rstestConfig).toContain('testTimeout: 120000');
    expect(rstestConfig).not.toContain('midscene.config');

    const pkg = JSON.parse(readFileSync(join(outDir, 'package.json'), 'utf8'));
    expect(pkg.scripts.test).toBe('rstest run');
    expect(pkg.dependencies['@midscene/testing-framework']).toBe('1.2.3-test');
    expect(pkg.devDependencies['@rstest/core']).toBe('latest');
  });

  it('allows callers to override emitted package versions', async () => {
    const root = createSourceProject(
      "export default { testDir: './e2e', include: ['**/*.yaml'] };\n",
    );
    const outDir = join(root, 'out');

    await emitRstestProject({
      configPath: join(root, 'midscene.config.ts'),
      outDir,
      frameworkVersion: '1.2.3',
      rstestVersion: '0.10.3',
    });

    const pkg = JSON.parse(readFileSync(join(outDir, 'package.json'), 'utf8'));
    expect(pkg.dependencies['@midscene/testing-framework']).toBe('1.2.3');
    expect(pkg.devDependencies['@rstest/core']).toBe('0.10.3');
  });
});
