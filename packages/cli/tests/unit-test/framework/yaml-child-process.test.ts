import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runYamlCaseInChildProcess } from '@/framework/yaml-child-process';
import { describe, expect, test } from 'vitest';

const createTempDir = () => mkdtempSync(join(tmpdir(), 'midscene-child-'));

describe('runYamlCaseInChildProcess', () => {
  test('runs the YAML case through an isolated child process', async () => {
    const root = createTempDir();
    const framework = join(root, 'framework.mjs');
    const marker = join(root, 'marker.json');
    const resultFile = join(root, 'result.json');

    writeFileSync(
      framework,
      `import { writeFileSync } from 'node:fs';
export async function runYamlCase(options) {
  writeFileSync(${JSON.stringify(marker)}, JSON.stringify(options));
  return { file: options.file, output: 'output.json', report: 'report.html', duration: 9 };
}
`,
    );

    try {
      const result = await runYamlCaseInChildProcess({
        file: join(root, 'case.yaml'),
        headed: true,
        keepWindow: false,
        frameworkImport: framework,
        resultFile,
        stdio: 'pipe',
      });

      expect(result.output).toBe('output.json');
      expect(result.report).toBe('report.html');
      expect(JSON.parse(readFileSync(marker, 'utf8'))).toEqual({
        file: join(root, 'case.yaml'),
        headed: true,
        keepWindow: false,
      });
      expect(JSON.parse(readFileSync(resultFile, 'utf8'))).toMatchObject({
        file: join(root, 'case.yaml'),
        success: true,
        executed: true,
        resultType: 'success',
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('surfaces child process failures to the Rstest case', async () => {
    const root = createTempDir();
    const framework = join(root, 'framework.mjs');
    const resultFile = join(root, 'result.json');
    mkdirSync(root, { recursive: true });
    writeFileSync(
      framework,
      `export async function runYamlCase(options) {
  throw new Error('child failed: ' + options.file);
}
`,
    );

    try {
      await expect(
        runYamlCaseInChildProcess({
          file: join(root, 'failed.yaml'),
          frameworkImport: framework,
          resultFile,
          stdio: 'pipe',
        }),
      ).rejects.toThrow(/child failed: .*failed\.yaml/);
      expect(JSON.parse(readFileSync(resultFile, 'utf8'))).toMatchObject({
        file: join(root, 'failed.yaml'),
        success: false,
        executed: true,
        resultType: 'failed',
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('preserves partialFailed result metadata without failing the Rstest case', async () => {
    const root = createTempDir();
    const framework = join(root, 'framework.mjs');
    const resultFile = join(root, 'result.json');
    writeFileSync(
      framework,
      `export async function runYamlCaseResult(options) {
  return {
    file: options.file,
    success: false,
    executed: true,
    output: 'output.json',
    report: 'report.html',
    duration: 11,
    resultType: 'partialFailed',
    error: 'assertion failed'
  };
}
`,
    );

    try {
      const result = await runYamlCaseInChildProcess({
        file: join(root, 'partial.yaml'),
        frameworkImport: framework,
        resultFile,
        stdio: 'pipe',
      });

      expect(result).toMatchObject({
        file: join(root, 'partial.yaml'),
        output: 'output.json',
        report: 'report.html',
        duration: 11,
      });
      expect(JSON.parse(readFileSync(resultFile, 'utf8'))).toMatchObject({
        file: join(root, 'partial.yaml'),
        success: false,
        executed: true,
        output: 'output.json',
        report: 'report.html',
        resultType: 'partialFailed',
        error: 'assertion failed',
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
