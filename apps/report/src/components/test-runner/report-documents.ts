import type {
  TestRunReportDocument,
  TestRunReportProject,
} from '@midscene/core';

/** Keep unexecuted plans in the overview without manufacturing execution data. */
export function getReportDocuments(
  project: TestRunReportProject,
): TestRunReportDocument[] {
  const documents = [...project.documents];
  for (const plan of project.plans ?? []) {
    if (
      documents.some((document) =>
        [
          document.documentId,
          document.logicalDocumentId,
          document.plan?.documentId,
        ].includes(plan.documentId),
      )
    )
      continue;
    documents.push({
      documentId: plan.documentId,
      sourcePath: plan.sourcePath,
      plan,
      status: 'success',
      executionStatus: 'not-run',
      beforeAll: [],
      afterAll: [],
      cases: plan.cases
        .filter((item) => item.selected)
        .map((item) => ({
          caseId: item.caseId,
          name: item.name,
          caseIndex: item.caseIndex,
          plan: item,
          status: 'not-run',
          notRunReason: project.lifecycle?.setupError
            ? 'project-setup-failed'
            : 'File did not run.',
          attempts: [],
        })),
    });
  }
  return documents.map((document) => {
    const plan =
      document.plan ??
      project.plans?.find((item) =>
        [document.documentId, document.logicalDocumentId].includes(
          item.documentId,
        ),
      );
    if (!plan) return document;
    const missing = plan.cases.filter(
      (item) =>
        item.selected &&
        !document.cases.some((testCase) => testCase.caseId === item.caseId),
    );
    if (!missing.length && document.plan) return document;
    return {
      ...document,
      plan,
      cases: [
        ...document.cases,
        ...missing.map((item) => ({
          caseId: item.caseId,
          name: item.name,
          caseIndex: item.caseIndex,
          plan: item,
          status: 'not-run' as const,
          notRunReason: project.lifecycle?.setupError
            ? 'project-setup-failed'
            : 'File did not execute this Case.',
          attempts: [],
        })),
      ],
    };
  });
}
