import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectWorkflowDocument } from '@midscene/test';
import { describe, expect, it } from '@rstest/core';
import reportE2e from '../e2e/midscene.config';

const e2eDirectory = fileURLToPath(new URL('../e2e/', import.meta.url));
const e2eFiles = readdirSync(e2eDirectory)
  .filter((file) => file.endsWith('.yaml'))
  .sort();
const nodes = new Map(reportE2e.nodes!.map((node) => [node.name, node]));

describe('report e2e YAML', () => {
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
