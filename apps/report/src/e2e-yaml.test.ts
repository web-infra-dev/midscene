import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readReportRunnerDump } from '@midscene/core/report';
import { collectWorkflowDocument } from '@midscene/test';
import { runTestProject } from '@midscene/test/config';
import { describe, expect, it } from '@rstest/core';
import reportE2e from '../e2e/midscene.config';

const e2eDirectory = fileURLToPath(new URL('../e2e/', import.meta.url));
const e2eFiles = readdirSync(e2eDirectory)
  .filter((file) => file.endsWith('.yaml'))
  .sort();
const nodes = new Map(reportE2e.nodes!.map((node) => [node.name, node]));

describe('report e2e YAML', () => {
  it('generates an index.html directory accepted by the report publisher', async () => {
    const root = mkdtempSync(join(tmpdir(), 'report-e2e-publishing-'));
    try {
      writeFileSync(
        join(root, 'midscene.config.ts'),
        `export default {
          output: ${JSON.stringify(reportE2e.output)},
          nodes: [{ name: 'noop', execute() {} }],
        };`,
      );
      writeFileSync(
        join(root, 'case.yaml'),
        'cases: [{ name: publishable report, steps: [{ noop: {} }] }]',
      );
      const result = await runTestProject({ projectRoot: root });
      expect(result.exitCode).toBe(0);
      expect(result.reportPath).toBe(
        join(
          root,
          'midscene_run',
          'report',
          `midscene-e2e-${result.runId}`,
          'index.html',
        ),
      );
      const summary = JSON.parse(readFileSync(result.summaryPath, 'utf8'));
      expect(resolve(dirname(result.summaryPath), summary.report)).toBe(
        result.reportPath,
      );
      expect(readReportRunnerDump(result.reportPath!)?.summary.passed).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  for (const file of e2eFiles) {
    it(`parses ${file}`, () => {
      expect(() =>
        collectWorkflowDocument(
          {
            projectId: 'report',
            sourcePath: `e2e/${file}`,
            absolutePath: join(e2eDirectory, file),
          },
          { resolveNode: (name) => nodes.get(name) },
        ),
      ).not.toThrow();
    });
  }
});
