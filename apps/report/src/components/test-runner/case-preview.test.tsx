import { describe, expect, it, rstest } from '@rstest/core';
import type { MouseEvent, ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createTestReportFixture } from '../../../e2e/fixtures/test-report.mjs';
import { CasePreview } from './case-preview';
import {
  buildRunnerVisualIndex,
  flattenRunnerCases,
  getCaseFailure,
} from './model';

function preview(index = 0) {
  const dump = createTestReportFixture({
    sources: [
      {
        reportId: 'report',
        scopeId: 'attempt-2',
        sourcePath: 'agent.html',
        executionIds: ['execution'],
      },
    ],
    metrics: {
      modelCallCount: 0,
      modelTimeMs: 0,
      promptTokens: 0,
      cachedInputTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    },
  });
  const item = flattenRunnerCases(dump)[index];
  const onOpen = rstest.fn();
  const element = CasePreview({
    item,
    visualIndex: buildRunnerVisualIndex([]),
    onOpen,
  });
  return { item, onOpen, element };
}

describe('project case card navigation', () => {
  it('removes Inspect while keeping the keyboard title and Inspect failure controls', () => {
    const { element } = preview();
    const html = renderToStaticMarkup(element);
    expect(html).not.toContain('runner-case-open-button');
    expect(html).toContain('runner-case-title-button');
    expect(html).toContain('Inspect failure');
    expect(html).toContain('<details');
  });

  it('opens ordinary card content without forcing a failed step', () => {
    const { element, onOpen, item } = preview();
    element.props.onClick({
      defaultPrevented: false,
      target: { closest: () => null },
    } as unknown as MouseEvent);
    expect(onOpen).toHaveBeenCalledExactlyOnceWith(item);
  });

  it.each(['button', 'a', 'details', '[role="button"]'])(
    'does not intercept %s interactions',
    (selector) => {
      const { element, onOpen } = preview();
      const closest = rstest.fn((selectors: string) =>
        selectors.includes(selector) ? {} : null,
      );
      element.props.onClick({
        defaultPrevented: false,
        target: { closest },
      } as unknown as MouseEvent);
      expect(onOpen).not.toHaveBeenCalled();
    },
  );

  it('opens the failed step once without triggering general inspection on bubbling', () => {
    const { element, onOpen, item } = preview();
    const button = element.props.children.find(
      (child: ReactElement | false) => {
        if (child === false) return false;
        return child.props.className?.includes('runner-case-failure-action');
      },
    );
    button.props.onClick();
    element.props.onClick({
      defaultPrevented: false,
      target: { closest: () => ({}) },
    } as unknown as MouseEvent);
    expect(onOpen).toHaveBeenCalledExactlyOnceWith(
      item,
      getCaseFailure(item.testCase)?.id,
    );
  });

  it('has no failure action for a directly passed case', () => {
    expect(renderToStaticMarkup(preview(1).element)).not.toContain(
      'Inspect failure',
    );
  });
});
