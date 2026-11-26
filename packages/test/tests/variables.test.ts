import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from '@rstest/core';
import { formatCliError } from '../src/cli/error-format';
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

  it('accepts whitespace inside environment variable references', () => {
    expect(
      resolveWorkflowVariables('token-${{ TOKEN }}', {
        env: { TOKEN: 'secret' },
        location,
      }),
    ).toBe('token-secret');
    expect(
      resolveWorkflowVariables('${{ TOKEN }}', {
        env: { TOKEN: 'secret' },
        location,
      }),
    ).toBe('secret');
  });

  it('rejects undefined environment variables written with spaces', () => {
    expect(() =>
      resolveWorkflowVariables('${{ MISSING }}', {
        env: {},
        location,
      }),
    ).toThrow('Undefined environment variable "MISSING"');
  });

  it('rejects unsupported ${{ ... }} references instead of keeping them as text', () => {
    expect(() =>
      resolveWorkflowVariables('${{ env.BASE_URL }}', {
        env: { BASE_URL: 'https://staging.example.com' },
        location,
      }),
    ).toThrow('Unsupported variable reference at offset 0');
  });

  it.each([
    ['prefix ${{ TARGET\nunrelated-body', 'Unterminated'],
    ['prefix ${{ env.TARGET unrelated-body }}', 'Unsupported'],
  ])(
    'keeps malformed reference content out of CLI diagnostics',
    (input, reason) => {
      let failure: unknown;
      try {
        resolveWorkflowVariables(input, { location });
      } catch (error) {
        failure = error;
      }
      expect(failure).toMatchObject({
        code: 'WORKFLOW_PARSE_ERROR',
        details: location,
      });
      const diagnostic = formatCliError(failure);
      expect(diagnostic).toContain(
        `${reason} variable reference at offset 7 in cases/order.yaml`,
      );
      expect(diagnostic).toContain('Use "${{NAME}}"');
      expect(diagnostic).not.toContain('unrelated-body');
    },
  );

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

  it('resolves node input while preserving its template and normalized engine metadata', () => {
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
      templateInput: { count: '${count}', nested: { value: '${{TOKEN}}' } },
      meta: {
        timeoutMs: 1234,
        continueOnError: true,
        sourceLocation: { line: 5, column: 9 },
      },
    });
  });

  it('keeps the display Project name in variable errors', () => {
    const directory = mkdtempSync(join(tmpdir(), 'workflow-variables-'));
    directories.push(directory);
    const absolutePath = join(directory, 'case.yaml');
    writeFileSync(
      absolutePath,
      'cases: [{ name: missing, steps: [{ inspect: "${missing}" }] }]',
    );

    expect(() =>
      collectWorkflowDocument(
        {
          projectId: 'project-1',
          projectName: 'ios-regression',
          sourcePath: 'case.yaml',
          absolutePath,
        },
        {
          resolveNode: (name) =>
            name === 'inspect'
              ? { name, stringInputKey: 'prompt', execute() {} }
              : undefined,
          variables: {},
          env: {},
        },
      ),
    ).toThrowError(
      expect.objectContaining({
        details: expect.objectContaining({
          projectName: 'ios-regression',
          variable: 'missing',
        }),
      }),
    );
  });

  it('resolves whitespace-padded environment references during collection', () => {
    const directory = mkdtempSync(join(tmpdir(), 'workflow-variables-'));
    directories.push(directory);
    const absolutePath = join(directory, 'case.yaml');
    writeFileSync(
      absolutePath,
      `
cases:
  - name: whitespace env case
    steps:
      - launch:
          uri: \${{ APP_URI }}
`,
    );

    const project = {
      projectId: 'android',
      sourcePath: 'case.yaml',
      absolutePath,
    };
    const launchNode = { name: 'launch', execute() {} };

    const document = collectWorkflowDocument(project, {
      resolveNode: (name) => (name === 'launch' ? launchNode : undefined),
      variables: {},
      env: { APP_URI: 'com.example.app' },
    });

    expect(document.cases[0].definition.steps[0].input).toEqual({
      uri: 'com.example.app',
    });

    expect(() =>
      collectWorkflowDocument(project, {
        resolveNode: (name) => (name === 'launch' ? launchNode : undefined),
        variables: {},
        env: {},
      }),
    ).toThrow('Undefined environment variable "APP_URI"');
  });
});
