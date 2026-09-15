import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const commonModules = [
  'execution-plan.ts',
  'project-preparation.ts',
  'run-prepared-project.ts',
  'document-invocation.ts',
] as const;

describe('native Test execution boundary', () => {
  it.each(commonModules)(
    '%s has no format-specific dependency or control access',
    (module) => {
      const path = join(__dirname, '../src/cli', module);
      const source = ts.createSourceFile(
        path,
        readFileSync(path, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      );
      const imports: string[] = [];
      const compatibilityAccesses: string[] = [];
      const compatibilityFields = new Set([
        'legacyPlan',
        'legacyResults',
        'sourceConfig',
        'yamlBrowser',
        'getPlayerOptions',
        'shareBrowserContext',
        'generateReport',
      ]);
      const visit = (node: ts.Node) => {
        if (
          ts.isImportDeclaration(node) &&
          ts.isStringLiteral(node.moduleSpecifier)
        )
          imports.push(node.moduleSpecifier.text);
        if (
          ts.isPropertyAccessExpression(node) &&
          compatibilityFields.has(node.name.text)
        )
          compatibilityAccesses.push(node.name.text);
        ts.forEachChild(node, visit);
      };
      visit(source);
      expect(
        imports.filter((path) =>
          /yaml|legacy|rstest|@midscene\/cli|\/runtime\//i.test(path),
        ),
      ).toEqual([]);
      expect(compatibilityAccesses).toEqual([]);
    },
  );

  it('keeps PR-added compatibility helpers out of formal SDK entry points', () => {
    const manifest = JSON.parse(
      readFileSync(join(__dirname, '../package.json'), 'utf8'),
    );
    expect(
      Object.keys(manifest.exports).filter(
        (path) => !path.startsWith('./internal/'),
      ),
    ).toEqual(['.', './config', './midscene']);
    expect(() => require.resolve('@midscene/test/runtime')).toThrow();
    const sdk = require('@midscene/test/config');
    expect(sdk.runTestProject).toBeTypeOf('function');
    for (const name of [
      'runTestProjectWithYamlCompatibility',
      'createYamlProjectSetup',
      'createYamlDocumentSetup',
      'createLegacyYamlDocumentHost',
    ])
      expect(sdk).not.toHaveProperty(name);
    const internal = require('@midscene/test/internal/yaml-runtime');
    expect(internal.createYamlPlayer).toBeTypeOf('function');
    expect(internal).not.toHaveProperty('runTestProjectWithYamlCompatibility');
  });
});
