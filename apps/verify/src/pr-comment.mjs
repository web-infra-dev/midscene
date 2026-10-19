export function verificationComment({
  run,
  conclusion,
  publicUrl,
  workflowUrl,
}) {
  const report = run.report;
  const base = `${publicUrl}/verifications/${run.id}`;
  const checkUrl = `https://github.com/${run.subject.repository}/runs/${run.checkId}`;
  const result =
    conclusion === 'success'
      ? 'Passed'
      : conclusion === 'cancelled'
        ? 'Superseded'
        : 'Failed';
  const summary = {
    schemaVersion: report.schemaVersion,
    verificationId: run.id,
    repository: run.subject.repository,
    pullRequest: run.subject.pullRequest,
    headSha: run.subject.headSha,
    policyDigest: report.policyDigest,
    conclusion,
    execution: report.execution.status,
    coverage: report.coverage,
    checkUrl,
    verdictUrl: `${base}/verdict.json`,
    manifestUrl: `${base}/manifest.json`,
    ...(workflowUrl ? { workflowUrl } : {}),
  };
  return [
    `<!-- midscene-verify:${run.id} -->`,
    `## Midscene Verify: ${result}`,
    '',
    `Commit: \`${run.subject.headSha}\``,
    `Execution: **${report.execution.status}**. Required criteria: **${report.coverage.passed}/${report.coverage.required} passed**.`,
    ...(conclusion === 'cancelled'
      ? [
          'This revision has been superseded. This result does not verify the current PR head.',
        ]
      : []),
    '',
    '| Criterion | Result |',
    '| --- | --- |',
    ...report.criteria.map(
      (criterion) => `| ${criterion.id} | ${criterion.status} |`,
    ),
    '',
    ...report.functionalGate.blockingReasons.map(
      (item) =>
        `- ${item.code}${item.criterionId ? `: ${item.criterionId}` : ''}`,
    ),
    '',
    `[App Check](${checkUrl}) · [HTML report](${base}/report.html) · [Agent verdict](${base}/verdict.json) · [Evidence manifest](${base}/manifest.json)`,
    ...(workflowUrl
      ? [
          `[Download the report, screenshots and traces from this workflow run](${workflowUrl}).`,
        ]
      : []),
    'Reports, screenshots and JSON evidence are publicly readable without a password. Workflow artifacts use GitHub access and retention rules.',
    '',
    '<details>',
    '<summary>Agent-readable result</summary>',
    '',
    '```json',
    JSON.stringify(summary, null, 2),
    '```',
    '',
    '</details>',
    '',
    'Only the configured criteria were tested. Verify the current head and the expected App identity before consuming this result. Other merge requirements still apply; this comment does not approve or merge the PR.',
  ].join('\n');
}

export async function publishVerificationComment({
  api,
  run,
  appId,
  conclusion,
  publicUrl,
  workflowUrl,
}) {
  if (run.commentId) return;
  const marker = `<!-- midscene-verify:${run.id} -->`;
  // Recover a successful POST followed by a failed local state write. Only
  // comments created by this App count; a user can copy the public marker.
  for (let page = 1; ; page++) {
    const comments = await api(
      'GET',
      `/issues/${run.subject.pullRequest}/comments?per_page=100&page=${page}`,
    );
    const existing = comments.find(
      (comment) =>
        comment.performed_via_github_app?.id === Number(appId) &&
        comment.body?.includes(marker),
    );
    if (existing) {
      run.commentId = existing.id;
      return;
    }
    if (comments.length < 100) break;
  }
  const comment = await api(
    'POST',
    `/issues/${run.subject.pullRequest}/comments`,
    { body: verificationComment({ run, conclusion, publicUrl, workflowUrl }) },
  );
  run.commentId = comment.id;
}
