import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYamlScript } from '@midscene/core/yaml';
import { describe, expect, it } from '@rstest/core';

const e2eDirectory = fileURLToPath(new URL('../e2e/', import.meta.url));
const e2eFiles = readdirSync(e2eDirectory)
  .filter((file) => file.endsWith('.yaml'))
  .sort();

describe('report e2e YAML', () => {
  for (const file of e2eFiles) {
    it(`parses ${file}`, () => {
      const filePath = join(e2eDirectory, file);
      const content = readFileSync(filePath, 'utf8');

      expect(() => parseYamlScript(content, filePath)).not.toThrow();
    });
  }
});
