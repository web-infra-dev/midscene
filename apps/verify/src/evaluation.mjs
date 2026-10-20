import { requireValue } from './config.mjs';

// Only one observation per case is accepted. Missing/inconclusive results remain
// visible and never silently improve the false-positive/false-negative rates.
export function evaluate(corpus, run) {
  requireValue(corpus.version === run.corpusVersion, 'Corpus version mismatch');
  requireValue(
    /^[a-f0-9]{40}$/.test(run.engineSha ?? '') &&
      run.plannerModel &&
      run.visualModel,
    'Pinned engine and models required',
  );
  requireValue(Array.isArray(run.observations), 'Missing observations');
  const cases = new Map(corpus.cases.map((item) => [item.id, item]));
  requireValue(cases.size === corpus.cases.length, 'Duplicate corpus case');
  const seen = new Set();
  let falsePositive = 0;
  let falseNegative = 0;
  let inconclusive = 0;
  let correct = 0;
  let unexpectedDecision = 0;
  for (const item of run.observations) {
    requireValue(
      cases.has(item.caseId) && !seen.has(item.caseId),
      'Unknown or repeated case observation',
    );
    requireValue(
      item.attempt === 1 &&
        typeof item.evidence === 'string' &&
        item.evidence.length > 0,
      'First attempt and evidence required',
    );
    requireValue(
      ['passed', 'assertion-failed', 'inconclusive'].includes(item.outcome),
      'Unknown evaluation outcome',
    );
    requireValue(
      Number.isFinite(item.durationMs) && item.durationMs >= 0,
      'Invalid duration',
    );
    seen.add(item.caseId);
    const truth = cases.get(item.caseId).truth;
    if (truth === 'working' && item.outcome === 'assertion-failed')
      falsePositive++;
    else if (truth === 'defective' && item.outcome === 'passed')
      falseNegative++;
    else if (truth === 'inconclusive' && item.outcome !== 'inconclusive')
      unexpectedDecision++;
    else if (
      (truth === 'working' && item.outcome === 'passed') ||
      (truth === 'defective' && item.outcome === 'assertion-failed') ||
      (truth === 'inconclusive' && item.outcome === 'inconclusive')
    )
      correct++;
    if (item.outcome === 'inconclusive') inconclusive++;
  }
  const observed = (truth) =>
    run.observations.filter((item) => cases.get(item.caseId).truth === truth)
      .length;
  return {
    scope: 'evaluation-observations-not-business-pr-acceptance',
    totalCases: cases.size,
    observed: seen.size,
    missing: [...cases.keys()].filter((id) => !seen.has(id)),
    correct,
    falsePositive,
    falseNegative,
    inconclusive,
    unexpectedDecision,
    falsePositiveRate: observed('working')
      ? falsePositive / observed('working')
      : null,
    falseNegativeRate: observed('defective')
      ? falseNegative / observed('defective')
      : null,
    complete: seen.size === cases.size,
    totalDurationMs: run.observations.reduce(
      (sum, item) => sum + item.durationMs,
      0,
    ),
  };
}
