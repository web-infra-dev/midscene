import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { digest, policyDigest } from '../src/config.mjs';
import { evaluate } from '../src/evaluation.mjs';
import { inspectBundle } from '../src/inspect.mjs';
import { planVerification } from '../src/planner.mjs';
import { buildReport } from '../src/report.mjs';
import { runBrowser } from '../src/runner.mjs';
import { fixtureApi, scenario } from './fixtures.mjs';

const save = (file, value) =>
  writeFile(file, JSON.stringify(value, null, 2), { flag: 'wx' });
export const outcomeOf = (report) =>
  report.diagnosis.category === 'assertion-failed'
    ? 'assertion-failed'
    : report.functionalGate.status === 'satisfied'
      ? 'passed'
      : 'inconclusive';

// No case retries. The production planner's bounded repair remains part of one
// attempt; its drafts are retained. An interrupted run leaves missing cases.
export async function runEvaluation({
  root,
  origin,
  engineSha,
  plannerModel,
  visualModel,
  provenance = {},
  planner = planVerification,
  runner = runBrowser,
  inspect = inspectBundle,
}) {
  const corpusText = await readFile(
    new URL('./cases.json', import.meta.url),
    'utf8',
  );
  const corpus = JSON.parse(corpusText);
  const run = {
    corpusVersion: corpus.version,
    engineSha,
    plannerModel,
    visualModel,
    observations: [],
  };
  evaluate(corpus, run); // Validate pins before any model request.
  await mkdir(root); // Exclusive run directory: never overwrite a previous run.
  await save(path.join(root, 'provenance.json'), {
    ...provenance,
    scope: 'synthetic-engine-evaluation',
    businessPrVerified: false,
    engineSha,
    plannerModel,
    visualModel,
    corpusDigest: digest(corpusText),
    startedAt: new Date().toISOString(),
    cost: null,
  });
  for (const item of corpus.cases) {
    const started = performance.now();
    const directory = path.join(root, item.id);
    const route = `/case-${corpus.cases.indexOf(item) + 1}`;
    await mkdir(directory);
    const fixture = scenario(item.id);
    await writeFile(path.join(directory, 'fixture.html'), fixture.html, {
      flag: 'wx',
    });
    const policy = {
      repository: 'local/evaluation',
      installationId: 1,
      environment: 'evaluation',
      allowedOrigins: [origin],
      allowLocalhost: true,
      revisionPath: `${route}/version.json`,
      timeoutMs: 180_000,
      criteria: [],
      ...(fixture.boundary
        ? {}
        : {
            planning: {
              mode: 'context',
              paths: [route],
              maxCriteria: 3,
            },
          }),
    };
    if (fixture.boundary)
      policy.criteria = [
        {
          id: 'AC-1',
          title: 'Observe the note editor',
          path: route,
          steps: [
            ...(item.id === 'action-not-completed'
              ? [
                  {
                    type: 'aiAct',
                    prompt:
                      'Click the Save button. You must click it; stop with an error if it is unavailable.',
                  },
                ]
              : []),
            { type: 'aiAssert', prompt: 'The Notes heading is visible.' },
          ],
        },
      ];
    await save(path.join(directory, 'input.json'), {
      demand: fixture.demand ?? null,
      policy,
      fixtureDigest: digest(fixture.html),
      mode: fixture.boundary ? 'fixed-boundary-check' : 'context-planning',
    });
    let report;
    let errorStage = 'planning';
    let failure;
    try {
      const planning = fixture.boundary
        ? undefined
        : await planner({
            ...fixtureApi(fixture.html, fixture.demand, engineSha),
            policy,
          });
      if (planning) {
        for (const [name, value] of Object.entries({
          plan: planning.plan,
          context: planning.context,
          'operator-policy': policy,
        }))
          await save(path.join(directory, `${name}.json`), value);
      }
      const executionPolicy = planning?.executionPolicy ?? policy;
      errorStage = 'execution';
      const execution =
        planning && !['ready', 'incomplete'].includes(planning.plan.status)
          ? { status: 'not-run', criteria: [] }
          : await runner({
              previewUrl: origin,
              policy: executionPolicy,
              directory,
              headSha: engineSha,
            });
      await save(path.join(directory, 'execution.json'), execution);
      errorStage = 'report';
      report = await buildReport({
        id: digest(item.id).replace('sha256:', ''),
        subject: {
          repository: policy.repository,
          headSha: engineSha,
          deploymentSha: engineSha,
        },
        policy: executionPolicy,
        operatorPolicy: policy,
        planning,
        execution,
        directory,
        currentHead: engineSha,
      });
      errorStage = 'integrity';
      await inspect(directory, {
        headSha: engineSha,
        expectedPolicyDigest: policyDigest(policy),
        expectedSource: 'local-runner',
      });
    } catch (error) {
      // No raw provider exceptions: they may contain request headers/credentials.
      failure = {
        stage: errorStage,
        code: 'EVALUATION_STAGE_FAILED',
        errorType: error.name,
      };
      await save(path.join(directory, 'error.json'), failure);
    }
    const observation = {
      caseId: item.id,
      attempt: 1,
      evidence: `${item.id}/${failure ? 'error.json' : 'verdict.json'}`,
      outcome: failure ? 'inconclusive' : outcomeOf(report),
      durationMs: Math.round(performance.now() - started),
      diagnosis: failure
        ? `harness-${failure.stage}-error`
        : report.diagnosis.category,
      ...(failure
        ? { failure }
        : { executionErrorCode: report.execution.errorCode ?? null }),
    };
    await save(path.join(directory, 'observation.json'), observation);
    run.observations.push(observation);
    console.log(JSON.stringify(observation));
  }
  await save(path.join(root, 'observations.json'), run);
  const metrics = evaluate(corpus, run);
  // Inconclusive by infrastructure failure is not a successful boundary test.
  const expectedDiagnoses = {
    'ambiguous-demand': 'planning-incomplete',
    'preview-unavailable': 'execution-error',
    'stale-revision': 'revision-mismatch',
    'action-not-completed': 'action-incomplete',
  };
  const boundaryMismatches = run.observations
    .filter(
      (item) =>
        expectedDiagnoses[item.caseId] &&
        (item.diagnosis !== expectedDiagnoses[item.caseId] ||
          (item.caseId === 'preview-unavailable' &&
            item.executionErrorCode !== 'ENVIRONMENT_ERROR')),
    )
    .map((item) => item.caseId);
  const harnessErrors = run.observations
    .filter((item) => item.failure)
    .map((item) => item.caseId);
  const result = {
    run,
    metrics,
    boundaryMismatches,
    harnessErrors,
    passed:
      metrics.complete &&
      metrics.correct === metrics.totalCases &&
      !boundaryMismatches.length &&
      !harnessErrors.length,
  };
  await save(path.join(root, 'result.json'), result);
  const rows = run.observations
    .map(
      (item) =>
        `| ${item.caseId} | ${corpus.cases.find((c) => c.id === item.caseId).truth} | ${item.outcome} | ${item.diagnosis} | [evidence](${item.evidence}) |`,
    )
    .join('\n');
  await writeFile(
    path.join(root, 'summary.md'),
    `# Engine evaluation\n\nSynthetic fixtures; not business PR acceptance. First attempt only. Cost is not measured.\n\nEngine: ${engineSha}\n\nPlanner: ${plannerModel}; visual: ${visualModel}\n\n| Case | Ground truth | Observation | Diagnosis | Evidence |\n| --- | --- | --- | --- | --- |\n${rows}\n\nPassed: ${result.passed}. Correct: ${metrics.correct}/${metrics.totalCases}. False positives: ${metrics.falsePositive}; false negatives: ${metrics.falseNegative}; inconclusive: ${metrics.inconclusive}.\n`,
    { flag: 'wx' },
  );
  return result;
}
