import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { parseWorkflowSource } from '../src/parser/source';

describe('workflow YAML source snapshot', () => {
  it('locates repeated steps, hook phases and aliases at their author positions', () => {
    const source = [
      'beforeAll:',
      '  - test.record: &value first',
      'cases:',
      '  - name: first',
      '    steps:',
      '      # comment',
      '      - test.record: *value',
      '      - test.record: second',
      '  - name: second',
      '    steps:',
      '      - test.record: third',
      'afterAll:',
      '  - test.record: done',
      '',
    ].join('\n');
    const snapshot = parseWorkflowSource(source);
    expect(snapshot.locate(['beforeAll', 0])).toEqual({ line: 2, column: 5 });
    expect(snapshot.locate(['cases', 0, 'steps', 0])).toEqual({
      line: 7,
      column: 9,
    });
    expect(snapshot.locate(['cases', 0, 'steps', 1])).toEqual({
      line: 8,
      column: 9,
    });
    expect(snapshot.locate(['cases', 1, 'steps', 0])).toEqual({
      line: 11,
      column: 9,
    });
    expect(snapshot.locate(['afterAll', 0])).toEqual({ line: 13, column: 5 });
    expect(snapshot.locate(['cases', 9, 'steps', 0])).toBeUndefined();
  });

  it('uses original lines despite multiline redaction, CRLF and BOM', () => {
    const snapshot = parseWorkflowSource(
      '\ufeffpassword: |\r\n  first\r\n  second\r\ncases:\r\n  - name: test\r\n    steps:\r\n      - test.record: hello\r\n',
    );
    expect(snapshot.locate(['cases', 0, 'steps', 0])).toEqual({
      line: 7,
      column: 9,
    });
  });

  it('locates an aliased step at the alias instead of its anchor definition', () => {
    const snapshot = parseWorkflowSource(
      'beforeAll:\n  - &shared {test.record: first}\ncases:\n  - name: test\n    steps:\n      - *shared\n',
    );
    expect(snapshot.locate(['cases', 0, 'steps', 0])).toEqual({
      line: 6,
      column: 9,
    });
  });

  it('preserves comments, author formatting and unresolved variables', () => {
    const source =
      '# Comment\r\ncases: [{name: "Search", steps: [{aiAct: "${keyword}"}]}]\r\n';
    const snapshot = parseWorkflowSource(source);
    expect(snapshot.sourceYaml).toEqual({ value: source });
    expect(snapshot.parsed).toEqual(load(source));
  });

  it.each([
    '\ufeffpassword: private\r\nprompt: hello\r\n',
    'password: "escaped\\u0020secret"\nprompt: hello\n',
    '"api-key": |\n  private first line\n  private second line\nprompt: hello\n',
    'empty:\nsecret: {nested: private}\nprompt: hello\n',
    '{authorization: [private, hidden], prompt: hello}',
    '? password\n: private\nprompt: hello\n',
  ])(
    'redacts structured secret fields without changing parsed execution data: %s',
    (source) => {
      const { parsed, sourceYaml } = parseWorkflowSource(source);
      expect(parsed).toEqual(load(source));
      expect(sourceYaml.value).not.toMatch(/private|hidden|escaped/);
      expect(sourceYaml.value).toContain('[REDACTED]');
      expect(sourceYaml.redactedPaths).toHaveLength(1);
      expect(load(sourceYaml.value as string)).toMatchObject({
        prompt: 'hello',
      });
    },
  );

  it('redacts anchor definitions when a secret field uses an alias', () => {
    const source =
      'shared: &credential "private"\npassword: *credential\nprompt: hello\n';
    const { sourceYaml } = parseWorkflowSource(source);
    expect(sourceYaml.value).not.toContain('private');
    expect(load(sourceYaml.value as string)).toEqual({
      shared: '[REDACTED]',
      password: '[REDACTED]',
      prompt: 'hello',
    });
  });

  it('redacts all aliases of a structured secret value', () => {
    const source =
      'token: &credential {nested: private}\ncopy: *credential\nprompt: hello\n';
    const { sourceYaml } = parseWorkflowSource(source);
    expect(sourceYaml.value).not.toContain('private');
    expect(load(sourceYaml.value as string)).toEqual({
      token: '[REDACTED]',
      copy: '[REDACTED]',
      prompt: 'hello',
    });
  });

  it('bounds the snapshot without truncating the parsed workflow', () => {
    const source = `prompt: ${'a'.repeat(70 * 1024)}\n`;
    const { parsed, sourceYaml } = parseWorkflowSource(source);
    expect(parsed).toEqual(load(source));
    expect((sourceYaml.value as string).length).toBeLessThan(66 * 1024);
    expect(sourceYaml.truncatedPaths).toEqual(['$']);
  });
});
