import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { parse } from '@babel/parser';
import { load } from 'js-yaml';

// Inspect authored JS/TS without executing it or installing Node loader hooks.
// This intentionally does not attempt to sandbox eval(), fs or installed packages.
export function validateImports(root, files, within) {
  const check = (source, node, script = false) => {
    const specifier =
      node?.type === 'StringLiteral'
        ? node.value
        : node?.type === 'TemplateLiteral' && node.expressions.length === 0
          ? node.quasis[0].value.cooked
          : undefined;
    if (typeof specifier !== 'string')
      throw new Error(
        `VERIFY_DYNAMIC_IMPORT: ${source}:${node?.loc?.start.line ?? '?'} must use a literal module path for verification.`,
      );
    // Absolute paths would still read the live source after copying the project.
    if (
      isAbsolute(specifier) ||
      specifier.startsWith('file:') ||
      specifier.startsWith('#')
    )
      throw new Error(
        `VERIFY_IMPORT_OUTSIDE_INPUTS: ${specifier} in ${source}; use a relative local import or an installed package.`,
      );
    if (!script && !specifier.startsWith('.')) return;
    const target = resolve(root, dirname(source), specifier.split(/[?#]/)[0]);
    const rel = relative(root, target).split(sep).join('/');
    const candidates = [
      rel,
      ...[
        '.js',
        '.mjs',
        '.cjs',
        '.ts',
        '.mts',
        '.cts',
        '.tsx',
        '.jsx',
        '.json',
      ].map((ext) => rel + ext),
    ];
    if (/\.[cm]?js$/.test(rel)) candidates.push(rel.replace(/js$/, 'ts'));
    if (
      !within(root, target) ||
      !Object.keys(files).some(
        (file) => candidates.includes(file) || file.startsWith(`${rel}/`),
      )
    )
      throw new Error(
        `VERIFY_IMPORT_OUTSIDE_INPUTS: ${specifier} in ${source} is outside the frozen file set.`,
      );
  };
  for (const file of Object.keys(files)) {
    if (/\.ya?ml$/.test(file)) {
      const seen = new WeakSet();
      const visitYaml = (value) => {
        if (!value || typeof value !== 'object' || seen.has(value)) return;
        seen.add(value);
        for (const [name, input] of Object.entries(value)) {
          if (
            (name.startsWith('ai') || name === 'runGherkinScenario') &&
            input?.replay !== undefined
          ) {
            const script =
              typeof input.replay === 'string'
                ? input.replay
                : input.replay?.script;
            check(file, { type: 'StringLiteral', value: script }, true);
          }
          visitYaml(input);
        }
      };
      visitYaml(load(readFileSync(join(root, file), 'utf8')));
      continue;
    }
    if (!/\.[cm]?[jt]sx?$/.test(file) || /\.d\.[cm]?ts$/.test(file)) continue;
    let ast;
    try {
      ast = parse(readFileSync(join(root, file), 'utf8'), {
        sourceType: 'unambiguous',
        createImportExpressions: true,
        plugins: [
          ...(/\.[cm]?tsx?$/.test(file) ? ['typescript'] : []),
          ...(/\.[jt]sx$/.test(file) ? ['jsx'] : []),
        ],
      });
    } catch (error) {
      throw new Error(`VERIFY_IMPORT_SYNTAX: ${file}: ${error.message}`, {
        cause: error,
      });
    }
    const visit = (node) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) return node.forEach(visit);
      if (!node.type) return;
      if (
        [
          'ImportDeclaration',
          'ExportNamedDeclaration',
          'ExportAllDeclaration',
          'ImportExpression',
        ].includes(node.type) &&
        node.source
      )
        check(file, node.source);
      if (node.type === 'TSExternalModuleReference')
        check(file, node.expression);
      if (
        node.type === 'CallExpression' &&
        (node.callee?.type === 'Import' ||
          (node.callee?.type === 'Identifier' &&
            node.callee.name === 'require') ||
          (node.callee?.type === 'MemberExpression' &&
            !node.callee.computed &&
            ((node.callee.object.name === 'module' &&
              node.callee.property.name === 'require') ||
              (node.callee.object.name === 'require' &&
                node.callee.property.name === 'resolve'))))
      )
        check(file, node.arguments[0]);
      Object.values(node).forEach(visit);
    };
    visit(ast);
  }
}
