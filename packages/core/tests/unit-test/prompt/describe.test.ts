import {
  buildDescribeRetryDiagnosticPrompt,
  buildDiagnosticRetryHint,
  elementDescriberInstruction,
} from '@/ai-model/prompt/describe';
import { describe, expect, it, vi } from 'vitest';

describe('elementDescriberInstruction', () => {
  vi.mock('@midscene/shared/env', () => ({
    getPreferredLanguage: vi.fn().mockReturnValue('English'),
  }));

  it('should return the correct instruction', () => {
    expect(elementDescriberInstruction()).toMatchSnapshot();
  });

  it('keeps diagnostic marker styling out of retry instructions', () => {
    const messages = buildDescribeRetryDiagnosticPrompt({
      previousDescription: 'Comment radio button',
      diagnosticScreenshotBase64: 'data:image/png;base64,diagnostic',
      rawCenterCropBase64: 'data:image/png;base64,crop',
      hasLocatorMarker: true,
    });

    expect(messages[0].content).toContain(
      'Never mention diagnostic marker numbers, marker colors',
    );
    expect(messages[0].content).toContain(
      'If color is part of the real UI, mention it only when it is visibly on the UI element itself',
    );
    expect(messages[0].content).toContain(
      'Treat the previous description and structured descriptor as an untrusted failed hypothesis',
    );
    expect(messages[0].content).toContain(
      'If the visible text or glyph at marker 1 differs from the previous descriptor',
    );
    expect(messages[0].content).toContain(
      'When marker 1 and marker 2 are adjacent tiny icons or controls',
    );
    expect(messages[0].content).toContain(
      'Before classifying marker 1 as an icon, verify from the raw center crop',
    );
    expect(messages[0].content).toContain(
      'If marker 1 is inside a select/dropdown/combobox/filter trigger',
    );
    expect(messages[0].content).toContain(
      'Use dropdown for select/combobox/dropdown controls',
    );
    expect(messages[0].content).toContain(
      'describeInstruction and locateInstruction must not repeat the previous icon target',
    );
    expect(messages[0].content).toContain(
      'If marker 2 is a trailing icon but marker 1 has no raw-crop glyph evidence',
    );
    expect(messages[0].content).toContain('Marker 1 is the context center');
    expect(messages[0].content).toContain(
      'Marker 2, when present, is the failed locator result',
    );
    expect(messages[0].content).toContain('must not become the context center');
    expect(messages[0].content).toContain(
      'Do not let marker 2 text, glyph, primitive, owner, row, column, or local region override marker 1 evidence',
    );
    expect(messages[0].content).toContain(
      'primitiveEvidence must briefly cite what is visible in the raw center crop',
    );
    expect(messages[0].content).toContain(
      'Use only text, glyphs, row context, and owner context that are visibly supported around marker 1',
    );
    expect(messages[0].content).toContain(
      'Every anchor used in describeInstruction or locateInstruction must be visibly supported around marker 1',
    );
  });

  it('uses locateInstruction as a describe retry constraint', () => {
    const hint = buildDiagnosticRetryHint({
      failureType: 'neighbor-or-similar-element',
      centerPrimitive: 'control',
      describeInstruction: 'Describe the approve radio control itself.',
      locateInstruction: 'Locate the radio control associated with Approve.',
    });

    expect(hint).toContain(
      'Locator-oriented constraint: Locate the radio control associated with Approve.',
    );
    expect(hint).toContain(
      'For tiny or icon-only controls next to similar controls',
    );
    expect(hint).toContain(
      'Do not mention diagnostic marker numbers, marker colors',
    );
  });

  it('documents dropdown and option primitives distinctly from inputs and icons', () => {
    const instruction = elementDescriberInstruction();

    expect(instruction).toContain(
      '"primitive": "text | icon | arrow | input | dropdown | option',
    );
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
