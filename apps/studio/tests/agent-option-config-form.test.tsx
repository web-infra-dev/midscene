// @vitest-environment jsdom
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  AgentOptionConfigForm,
  agentOptionsToFormValues,
  parseAgentOptionFormValues,
} from '../src/renderer/components/ShellLayout/AgentOptionConfigForm';

describe('AgentOptionConfigForm', () => {
  it('renders only the three supported Agent options', () => {
    const html = renderToStaticMarkup(
      createElement(AgentOptionConfigForm, {
        values: agentOptionsToFormValues({}),
        onChange: vi.fn(),
      }),
    );

    expect(html).toContain('Agent Option Config');
    expect(html).toContain('Replanning Cycle Limit');
    expect(html).toContain('Wait After Action (ms)');
    expect(html).toContain('Screenshot Shrink Factor');
    expect(html).toContain('Changes apply on the next Agent connection.');
    expect(html).not.toContain('aiActContext');
    expect(html).not.toContain('reportFileName');
  });

  it('parses valid values and omits empty fields', () => {
    expect(
      parseAgentOptionFormValues({
        replanningCycleLimit: '0',
        waitAfterAction: '',
        screenshotShrinkFactor: '2.5',
      }),
    ).toEqual({
      options: {
        replanningCycleLimit: 0,
        screenshotShrinkFactor: 2.5,
      },
      error: null,
    });
  });

  it('rejects values outside the supported ranges', () => {
    expect(
      parseAgentOptionFormValues({
        replanningCycleLimit: '-1',
        waitAfterAction: '300',
        screenshotShrinkFactor: '1',
      }),
    ).toMatchObject({ options: null });
    expect(
      parseAgentOptionFormValues({
        replanningCycleLimit: '12',
        waitAfterAction: '-1',
        screenshotShrinkFactor: '1',
      }),
    ).toMatchObject({ options: null });
    expect(
      parseAgentOptionFormValues({
        replanningCycleLimit: '12',
        waitAfterAction: '300',
        screenshotShrinkFactor: '0.5',
      }),
    ).toMatchObject({ options: null });
  });
});
