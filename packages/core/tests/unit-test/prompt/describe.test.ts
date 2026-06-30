import { elementDescriberInstruction } from '@/ai-model/prompt/describe';
import { describe, expect, it, vi } from 'vitest';

describe('elementDescriberInstruction', () => {
  vi.mock('@midscene/shared/env', () => ({
    getPreferredLanguage: vi.fn().mockReturnValue('English'),
  }));

  it('should return the correct instruction', () => {
    expect(elementDescriberInstruction()).toMatchSnapshot();
  });

  it('uses description-only schema', () => {
    const instruction = elementDescriberInstruction();

    expect(instruction).toContain('"description": "unique element identifier"');
    expect(instruction).not.toContain(
      '"target": "the smallest indicated UI part itself',
    );
    expect(instruction).not.toContain('"primitive": "text | icon | arrow');
    expect(instruction).toContain('OBSERVE IN THIS ORDER:\n1. Target first:');
  });

  it('documents dropdown and option targets distinctly from inputs and icons', () => {
    const instruction = elementDescriberInstruction();

    expect(instruction).toContain(
      'use primitive "dropdown" and describe that dropdown/select control',
    );
    expect(instruction).toContain(
      'use primitive "option" for selectable list options',
    );
    expect(instruction).toContain(
      'Only use primitive "icon" or "arrow" when the endpoint/center directly overlaps the real glyph strokes',
    );
  });
});
