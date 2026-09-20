import { classifyWorkflowDocumentFormat } from '@/test-runner/parser/document-format';
import { describe, expect, it } from '@rstest/core';

describe('workflow document format classification', () => {
  it.each([
    [{ tasks: [] }, 'legacy'],
    [{ files: ['flow.yaml'] }, 'legacy-batch'],
    [{ cases: [] }, 'native'],
    [{ beforeEach: [] }, 'native'],
    [{ tasks: [], afterAll: [] }, 'mixed'],
    [{ files: 'flow.yaml' }, 'unknown'],
    [null, 'unknown'],
  ] as const)('classifies %j as %s', (input, expected) => {
    expect(classifyWorkflowDocumentFormat(input)).toBe(expected);
  });
});
