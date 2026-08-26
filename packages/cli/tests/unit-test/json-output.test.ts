import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createCliJsonErrorOutput,
  createCliJsonRunOutput,
} from '@/json-output';
import { describe, expect, test } from '@rstest/core';

describe('CLI JSON output', () => {
  test('creates a versioned run result with parsed YAML output', () => {
    const root = mkdtempSync(join(tmpdir(), 'midscene-cli-json-'));
    const outputPath = join(root, 'case-output.json');
    writeFileSync(outputPath, JSON.stringify({ answer: 'done' }));

    try {
      expect(
        createCliJsonRunOutput({
          exitCode: 0,
          summaryPath: join(root, 'summary.json'),
          results: [
            {
              file: join(root, 'case.yaml'),
              success: true,
              executed: true,
              resultType: 'success',
              duration: 12,
              output: outputPath,
              report: join(root, 'case.html'),
            },
          ],
        }),
      ).toEqual({
        schemaVersion: 1,
        ok: true,
        exitCode: 0,
        summary: {
          path: join(root, 'summary.json'),
          total: 1,
          successful: 1,
          failed: 0,
          partialFailed: 0,
          notExecuted: 0,
          totalDuration: 12,
        },
        results: [
          {
            file: join(root, 'case.yaml'),
            success: true,
            executed: true,
            resultType: 'success',
            duration: 12,
            error: null,
            report: join(root, 'case.html'),
            outputPath,
            output: { answer: 'done' },
          },
        ],
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('throws when a declared YAML output file is missing', () => {
    const root = mkdtempSync(join(tmpdir(), 'midscene-cli-json-'));
    const outputPath = join(root, 'missing.json');

    try {
      expect(() =>
        createCliJsonRunOutput({
          exitCode: 0,
          summaryPath: join(root, 'summary.json'),
          results: [
            {
              file: join(root, 'case.yaml'),
              success: true,
              executed: true,
              resultType: 'success',
              output: outputPath,
            },
          ],
        }),
      ).toThrow(`Failed to read YAML output file: ${outputPath}`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('throws when a declared YAML output file is not valid JSON', () => {
    const root = mkdtempSync(join(tmpdir(), 'midscene-cli-json-'));
    const outputPath = join(root, 'invalid.json');
    writeFileSync(outputPath, 'not json');

    try {
      expect(() =>
        createCliJsonRunOutput({
          exitCode: 0,
          summaryPath: join(root, 'summary.json'),
          results: [
            {
              file: join(root, 'case.yaml'),
              success: true,
              executed: true,
              resultType: 'success',
              output: outputPath,
            },
          ],
        }),
      ).toThrow(`YAML output file is not valid JSON: ${outputPath}`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('creates a structured error result without exposing a stack', () => {
    expect(createCliJsonErrorOutput(new TypeError('invalid config'))).toEqual({
      schemaVersion: 1,
      ok: false,
      exitCode: 1,
      error: {
        name: 'TypeError',
        message: 'invalid config',
      },
    });
  });

  test('keeps script failures in the completed run result', () => {
    expect(
      createCliJsonRunOutput({
        exitCode: 1,
        summaryPath: '/tmp/summary.json',
        results: [
          {
            file: '/tmp/failed.yaml',
            success: false,
            executed: true,
            resultType: 'failed',
            error: 'assertion failed',
          },
        ],
      }),
    ).toMatchObject({
      ok: false,
      exitCode: 1,
      summary: { failed: 1 },
      results: [{ resultType: 'failed', error: 'assertion failed' }],
    });
  });
});
