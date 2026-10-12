import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { parseWorkflowSource } from '../src/parser/source';

describe('workflow YAML source snapshot', () => {
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
