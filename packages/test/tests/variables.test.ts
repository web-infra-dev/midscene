import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { collectWorkflowDocument } from '../src/parser/collect';
import { resolveWorkflowVariables } from '../src/parser/variables';

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const location = {
  projectName: 'android',
  sourcePath: 'cases/order.yaml',
  phase: 'steps' as const,
  caseIndex: 1,
  stepIndex: 2,
};

describe('workflow variables', () => {
  it('resolves recursively, preserves exact project value types, and keeps env strings', () => {
    const resolved = resolveWorkflowVariables(
      {
        count: '${count}',
        enabled: '${enabled}',
        options: '${options}',
        message: 'order-${id}-${{REGION}}',
        opaqueEnvironment: 'token-${{TOKEN}}',
        nested: ['${count}', '${{PORT}}'],
      },
      {
        variables: {
          count: 3,
          enabled: true,
          id: 42,
          options: { retries: 2 },
        },
        env: { REGION: 'cn', PORT: '8080', TOKEN: '${id}' },
        location,
      },
    );

    expect(resolved).toEqual({
      count: 3,
      enabled: true,
      options: { retries: 2 },
      message: 'order-42-cn',
      opaqueEnvironment: 'token-${id}',
      nested: [3, '8080'],
    });
  });

  it('reports missing variables with project, source, case, phase, and step', () => {
    expect(() =>
      resolveWorkflowVariables('${missing}', {
        variables: {},
        env: {},
        location,
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'WORKFLOW_PARSE_ERROR',
        details: expect.objectContaining({
          ...location,
          variable: 'missing',
          variableKind: 'project',
        }),
      }),
    );
    expect(() =>
      resolveWorkflowVariables('${{TOKEN}}', {
        variables: {},
        env: {},
        location,
      }),
    ).toThrow('Undefined environment variable "TOKEN"');
  });

  it('rejects object and array variables embedded in strings', () => {
    expect(() =>
      resolveWorkflowVariables('value-${object}', {
        variables: { object: { id: 1 } },
        location,
      }),
    ).toThrow('must be a primitive when embedded in a string');
    expect(() =>
      resolveWorkflowVariables('value-${items}', {
        variables: { items: ['one'] },
        location,
      }),
    ).toThrow('must be a primitive when embedded in a string');
  });

  it('resolves only node input and leaves normalized engine metadata intact', () => {
    const directory = mkdtempSync(join(tmpdir(), 'workflow-variables-'));
    directories.push(directory);
    const absolutePath = join(directory, 'case.yaml');
    writeFileSync(
      absolutePath,
      `
cases:
  - name: variable case
    steps:
      - inspect:
          count: \${count}
          nested:
            value: \${{TOKEN}}
          $:
            timeout: 1234
            continue-on-error: true
`,
    );

    const document = collectWorkflowDocument(
      {
        projectId: 'android',
        sourcePath: 'case.yaml',
        absolutePath,
      },
      {
        resolveNode: (name) =>
          name === 'inspect' ? { name, execute() {} } : undefined,
        variables: { count: 2 },
        env: { TOKEN: 'secret' },
      },
    );

    expect(document.cases[0].definition.steps[0]).toEqual({
      node: 'inspect',
      input: { count: 2, nested: { value: 'secret' } },
      meta: { timeoutMs: 1234, continueOnError: true },
    });
  });
});
