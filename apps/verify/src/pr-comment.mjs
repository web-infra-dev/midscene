const plain = (value) =>
  String(value)
    .replace(/[\r\n]/g, ' ')
    .replace(/([\\`*_[\]<>|])/g, '\\$1')
    .replace(/@/g, '@\u200b');

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
      : conclusion === 'action_required'
        ? report.planning?.status === 'needs-clarification'
          ? 'Needs clarification'
          : 'Inconclusive'
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
    diagnosis: report.diagnosis,
    ...(report.planning
      ? {
          planning: report.planning,
          operatorPolicyDigest: report.operatorPolicyDigest,
          planUrl: `${base}/plan.json`,
          contextUrl: `${base}/context.json`,
        }
      : {}),
    checkUrl,
    verdictUrl: `${base}/verdict.json`,
    manifestUrl: `${base}/manifest.json`,
    midsceneReportUrls: report.criteria.flatMap((criterion) =>
      criterion.evidence
        .filter((name) => name.endsWith('.midscene.html'))
        .map((name) => `${base}/${name}`),
    ),
    ...(workflowUrl ? { workflowUrl } : {}),
  };
  return [
    `<!-- midscene-verify:${run.id} -->`,
    `## Midscene Verify: ${result}`,
    '',
    `Commit: \`${run.subject.headSha}\``,
    `Execution: **${report.execution.status}**. Required criteria: **${report.coverage.passed}/${report.coverage.required} passed**.`,
    ...(report.diagnosis
      ? [
          `Diagnosis: **${report.diagnosis.category}**. ${report.diagnosis.nextAction}`,
        ]
      : []),
    ...(conclusion === 'cancelled'
      ? [
          'This revision has been superseded. This result does not verify the current PR head.',
        ]
      : []),
    '',
    ...(report.planning
      ? [
          `Plan: ${plain(report.planning.summary)}`,
          `[Verification plan](${base}/plan.json) · [Context sources](${base}/context.json)`,
          ...report.planning.unverified.map(
            (item) =>
              `- Not verified: ${plain(item.path)} — ${plain(item.reason)}`,
          ),
          ...report.planning.questions.map(
            (item) => `- Clarification needed: ${plain(item)}`,
          ),
          ...report.planning.limitations.map(
            (item) => `- Context limitation: ${plain(item)}`,
          ),
          '',
        ]
      : []),
    '| Criterion | What was tested | Result |',
    '| --- | --- | --- |',
    ...report.criteria.map(
      (criterion) =>
        `| ${criterion.id} | ${plain(criterion.title)} | ${criterion.status} |`,
    ),
    '',
    ...report.functionalGate.blockingReasons.map(
      (item) =>
        `- ${item.code}${item.criterionId ? `: ${item.criterionId}` : ''}`,
    ),
    '',
    ...report.criteria.flatMap((criterion) =>
      criterion.evidence
        .filter((name) => name.endsWith('.midscene.html'))
        .map(
          (name) =>
            `[Open Midscene HTML report — ${criterion.id}](${base}/${name})`,
        ),
    ),
    `[App Check](${checkUrl}) · [Acceptance summary](${base}/report.html) · [Agent verdict](${base}/verdict.json) · [Evidence manifest](${base}/manifest.json)`,
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
