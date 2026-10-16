import type { TestRunReportDump } from '@midscene/core';
import { describe, expect, it } from '@rstest/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { createOverviewReportFixture } from '../../../e2e/fixtures/test-report.mjs';
import { CaseNavigation, CaseNavigationList } from './case-navigation';
import { flattenRunnerCases } from './model';
import { buildOverviewProjects } from './overview-model';

const fixture = () => {
  const dump = createOverviewReportFixture({
    sources: [
      {
        reportId: 'report',
        executionIds: ['execution'],
        scopeId: 'scope',
        sourcePath: 'agent.html',
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
  }) as TestRunReportDump;
  return buildOverviewProjects(dump, flattenRunnerCases(dump));
};

describe('case navigation', () => {
  it('lists every Case by Project with its source and final result, including not-run Cases', () => {
    const projects = fixture();
    const html = renderToStaticMarkup(
      <CaseNavigationList
        projects={projects}
        currentCaseKey={projects[0].cases[0].key}
        onOpenCase={() => {}}
      />,
    );
    expect(html.match(/<button /g)).toHaveLength(5);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toContain('title="checkout.yaml"');
    expect(html).toContain('title="smoke/checkout.yaml"');
    expect(html).toContain('title="blocked.yaml"');
    expect(html).toContain('passed (earlier attempt failed)');
    expect(html).not.toContain('passed after retry');
    expect(html).toContain('not run');
    expect(html.indexOf('Web regression')).toBeLessThan(
      html.indexOf('Mobile regression'),
    );
    expect(html).not.toContain('broken.yaml');
  });

  it('uses Case identity rather than names to mark the current item across Projects and Files', () => {
    const projects = fixture();
    const duplicate = projects[1].cases[0];
    duplicate.testCase.name = projects[0].cases[0].testCase.name;
    const html = renderToStaticMarkup(
      <CaseNavigationList
        projects={projects}
        currentCaseKey={duplicate.key}
        onOpenCase={() => {}}
      />,
    );
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toContain(
      'aria-current="page" aria-label="Open Checkout with retry in Mobile regression',
    );
  });

  it('keeps complete long names and paths in tooltips and accessible names', () => {
    const projects = fixture();
    const item = projects[0].cases[0];
    item.testCase.name = 'A long case name '.repeat(30);
    projects[0].files[0].sourcePath = `${'nested/'.repeat(30)}checkout.yaml`;
    const html = renderToStaticMarkup(
      <CaseNavigationList
        projects={projects}
        currentCaseKey={item.key}
        onOpenCase={() => {}}
      />,
    );
    expect(html).toContain(`title="${item.testCase.name}"`);
    expect(html).toContain(`title="${projects[0].files[0].sourcePath}"`);
    expect(html).toContain(
      `aria-label="Open ${item.testCase.name} in Web regression`,
    );
  });

  it('offers the drawer only when another Case is available', () => {
    const projects = fixture();
    const render = (values: typeof projects) =>
      renderToStaticMarkup(
        <CaseNavigation
          projects={values}
          currentCaseKey={projects[0].cases[0].key}
          onOpenCase={() => {}}
        />,
      );
    expect(render(projects)).toContain('aria-label="View all cases"');
    expect(render(projects)).toContain('aria-expanded="false"');
    expect(render([])).toBe('');
    expect(render([{ ...projects[0], cases: [projects[0].cases[0]] }])).toBe(
      '',
    );
  });
});
