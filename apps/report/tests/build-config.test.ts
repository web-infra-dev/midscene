import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from '@rstest/core';
import ts from 'typescript';

const reportRoot = fileURLToPath(new URL('../', import.meta.url));

const configFiles = (name: string) => {
  const configPath = path.join(reportRoot, name);
  const { config, error } = ts.readConfigFile(configPath, ts.sys.readFile);
  if (error) {
    throw new Error(ts.flattenDiagnosticMessageText(error.messageText, '\n'));
  }
  const parsed = ts.parseJsonConfigFileContent(config, ts.sys, reportRoot);
  expect(parsed.errors).toEqual([]);
  return parsed.fileNames.map((file) =>
    path.relative(reportRoot, file).split(path.sep).join('/'),
  );
};

describe('report TypeScript build scope', () => {
  it('keeps colocated tests and the e2e setup in the build type check', () => {
    const files = configFiles('tsconfig.build.json');

    expect(files).toContain('src/index.tsx');
    expect(files).toContain('src/e2e-yaml.test.ts');
    expect(files).toContain('e2e/midscene.config.ts');
  });

  it('keeps unit tests and the e2e setup in the development type check', () => {
    const files = configFiles('tsconfig.json');

    expect(files).toContain('src/e2e-yaml.test.ts');
    expect(files).toContain('tests/build-config.test.ts');
    expect(files).toContain('e2e/midscene.config.ts');
  });
});
