import type { TestRunReportSourceIndex } from '@midscene/core';
import {
  type CaseRunResult,
  type RunReportInput,
  type StepRunResult,
  WorkflowError,
  buildTestRunReportDump,
} from '@midscene/core/internal/test-runner';
import { describe, expect, it } from '@rstest/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { CaseWorkspace } from './case-workspace';
import { CaseWorkspaceHeader } from './case-workspace-header';
import {
  getCaseWorkspaceDocument,
  getCaseWorkspaceDocumentAttemptIndex,
  getCaseWorkspaceStepGroups,
} from './case-workspace-model';
import {
  buildRunnerVisualIndex,
  flattenRunnerCases,
  getRunnerHealth,
} from './model';

const index: TestRunReportSourceIndex = {
  sources: [],
  metrics: {
    modelCallCount: 0,
    modelTimeMs: 0,
    promptTokens: 0,
    cachedInputTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  },
};
const timing = {
  startedAt: '2026-08-20T00:00:00.000Z',
  endedAt: '2026-08-20T00:00:01.000Z',
  durationMs: 1000,
};
const step = (
  phase: StepRunResult['phase'],
  failed: boolean,
): StepRunResult => ({
  ...timing,
  phase,
  stepIndex: 0,
  node: `fixture.${phase}`,
  input: {},
  meta: { continueOnError: false },
  status: failed ? 'failed' : 'success',
  continuedAfterError: false,
  ...(failed ? { error: new WorkflowError(`${phase} failed`) } : {}),
});

const retryInput = (
  failure: 'beforeAll' | 'steps' | 'afterAll',
): RunReportInput => {
  const documents = [0, 1].map((attemptIndex) => ({
    ...timing,
    documentId: 'document',
    documentRunId: `file-${attemptIndex}`,
    attemptIndex,
    projectId: 'project',
    projectName: 'web',
    sourcePath: 'case.yaml',
    status: attemptIndex === 0 ? ('failed' as const) : ('success' as const),
    beforeAll: [
      step('beforeAll', attemptIndex === 0 && failure === 'beforeAll'),
    ],
    afterAll: [step('afterAll', attemptIndex === 0 && failure === 'afterAll')],
  }));
  const cases = documents.map((document) => {
    const status: 'success' | 'failed' | 'not-run' =
      document.attemptIndex === 0
        ? failure === 'beforeAll'
          ? 'not-run'
          : failure === 'steps'
            ? 'failed'
            : 'success'
        : 'success';
    const identity = {
      caseId: 'case',
      projectName: 'web',
      name: 'one logical case',
      sourcePath: 'case.yaml',
      caseIndex: 0,
    };
    const run: CaseRunResult | undefined =
      status === 'not-run'
        ? undefined
        : {
            ...identity,
            ...timing,
            runId: `case-${document.attemptIndex}`,
            attemptIndex: 0,
            status,
            beforeEach: [],
            steps: [step('steps', status === 'failed')],
            afterEach: [],
          };
    return {
      ...identity,
      documentId: document.documentId,
      documentRunId: document.documentRunId,
      status,
      run,
    };
  });
  return {
    ...timing,
    runId: 'root',
    status: 'success',
    summary: {
      total: 1,
      passed: 1,
      failed: 0,
      notRun: 0,
      filtered: 0,
      collectionErrors: 0,
      documentFailures: 0,
      projectFailures: 0,
    },
    projects: [
      {
        projectId: 'project',
        name: 'web',
        platform: 'web',
        status: 'success',
        retry: 1,
        documents,
        cases,
        collectionErrors: [],
      },
    ],
  };
};

describe('whole-file retry report projection and viewer', () => {
  it('counts a final file retry that failed before any case could run', () => {
    const input = retryInput('steps');
    const project = input.projects[0];
    input.status = project.status = 'failed';
    input.summary = {
      ...input.summary,
      passed: 0,
      notRun: 1,
      documentFailures: 1,
    };
    project.documents[1].status = 'failed';
    project.documents[1].beforeAll = [step('beforeAll', true)];
    project.cases[1].status = 'not-run';
    project.cases[1].run = undefined;
    const [item] = flattenRunnerCases(buildTestRunReportDump(input, index));
    expect(item).toMatchObject({ status: 'not-run', retryCount: 1 });
    expect(item.testCase.attempts).toHaveLength(1);
    expect(getCaseWorkspaceDocumentAttemptIndex(item)).toBe(1);
    expect(
      getCaseWorkspaceStepGroups(item, undefined, 1)[0].steps[0].status,
    ).toBe('failed');
  });

  it.each(['beforeAll', 'steps', 'afterAll'] as const)(
    'counts one logical case and exposes the failed %s file attempt',
    (failure) => {
      const dump = buildTestRunReportDump(retryInput(failure), index);
      const cases = flattenRunnerCases(dump);
      expect(cases).toHaveLength(1);
      const item = cases[0];
      expect(item).toMatchObject({ status: 'retry-passed', retryCount: 1 });
      expect(getRunnerHealth(cases)).toMatchObject({
        executed: 1,
        finalPassRate: 1,
        firstPassRate: 0,
        retryPassedCount: 1,
      });
      const failedDocument = item.document.attempts![0];
      const failedAttempt = item.testCase.attempts.find(
        (attempt) => attempt.attemptIndex === 0,
      );
      const failedStep =
        failure === 'steps'
          ? failedAttempt!.steps[0]
          : failure === 'beforeAll'
            ? failedDocument.beforeAll[0]
            : failedDocument.afterAll[0];
      expect(getCaseWorkspaceDocumentAttemptIndex(item, failedStep.id)).toBe(0);
      expect(getCaseWorkspaceDocument(item, failedAttempt, 0).status).toBe(
        'failed',
      );
      expect(
        getCaseWorkspaceStepGroups(item, failedAttempt, 0).flatMap(
          ({ steps }) => steps,
        ),
      ).toContain(failedStep);
      if (failure === 'beforeAll') {
        expect(failedAttempt).toBeUndefined();
        expect(
          getCaseWorkspaceStepGroups(item, undefined, 0).map(
            ({ label }) => label,
          ),
        ).not.toContain('Case steps');
      }
      const html = renderToStaticMarkup(
        <CaseWorkspace
          item={item}
          initialStepId={failedStep.id}
          reports={[]}
          visualIndex={buildRunnerVisualIndex([])}
          tracePage={false}
          renderAgentReport={() => null}
          onBack={() => {}}
          onCloseTracePage={() => {}}
          backLabel="Overview"
        />,
      );
      expect(html).toContain('aria-label="File attempts"');
      expect(html).toContain('role="combobox"');
      expect(html).toContain('File attempt 1');
      expect(html).toContain(`${failure} failed`);

      const retryHeader = renderToStaticMarkup(
        <CaseWorkspaceHeader
          item={item}
          selectedDocumentAttemptIndex={1}
          backLabel="Overview"
          onBack={() => {}}
          onSelectAttempt={() => {}}
          onSelectDocumentAttempt={() => {}}
        />,
      );
      expect(retryHeader).toContain('File attempt 2');
      expect(retryHeader).toContain('is-success');
    },
  );
});
