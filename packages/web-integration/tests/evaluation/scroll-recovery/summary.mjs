import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
export function quantile(values, q) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * q;
  const low = Math.floor(index);
  return sorted[low] + (sorted[Math.ceil(index)] - sorted[low]) * (index - low);
}
export function validateRun(manifest, records) {
  if (records.length !== manifest.jobs.length)
    throw new Error(
      `Incomplete run: ${records.length}/${manifest.jobs.length}`,
    );
  const expected = new Set(
    manifest.jobs.map((j) => `${j.case}/${j.arm}/${j.rep}`),
  );
  for (const r of records) {
    const key = `${r.caseId}/${r.arm}/${r.rep}`;
    if (r.track !== manifest.track || !expected.delete(key))
      throw new Error(`Unexpected or repeated attempt ${key}`);
  }
  if (expected.size) throw new Error('Missing scheduled attempts');
}

export function summarize(records) {
  const ids = new Set();
  for (const r of records) {
    if (ids.has(r.id)) throw new Error(`Duplicate attempt ${r.id}`);
    ids.add(r.id);
  }
  const groups = {};
  for (const r of records) {
    const key = `${r.track}/${r.split}/${r.arm}`;
    groups[key] ||= [];
    groups[key].push(r);
  }
  const aggregate = (rows) => ({
    attempts: rows.length,
    passed: rows.filter((r) => r.success).length,
    goalReachedBeforeExit: rows.filter((r) =>
      r.family === 'explicit'
        ? r.compliant &&
          Math.abs(
            (r.final?.y ?? Number.NaN) - (r.initial?.y ?? Number.NaN) - 400,
          ) <= 2
        : r.family === 'boundary'
          ? r.compliant
          : r.final?.clicks?.includes('target'),
    ).length,
    successRate: rows.filter((r) => r.success).length / rows.length,
    constraintFailures: rows.filter((r) => !r.compliant).length,
    explicitInstructionViolations: rows.filter(
      (r) => ['explicit', 'boundary'].includes(r.family) && !r.compliant,
    ).length,
    wrongInteractionAttempts: rows.filter((r) => r.wrongClicks > 0).length,
    serviceFailures: rows.filter((r) =>
      /429|rate.limit|502|503|504|ECONN|ENOTFOUND/i.test(r.error || ''),
    ).length,
    errors: rows.filter((r) => r.error).length,
    reviews: rows.reduce((s, r) => s + r.reviews.length, 0),
    triggeredAttempts: rows.filter((r) => r.reviews.length).length,
    realCalls: rows.reduce(
      (s, r) => s + r.calls.filter((c) => !c.synthetic).length,
      0,
    ),
    tokens: rows.reduce((s, r) => s + r.tokens, 0),
    inputTokens: rows
      .flatMap((r) => r.usage ?? [])
      .reduce((s, u) => s + (u.prompt_tokens ?? 0), 0),
    outputTokens: rows
      .flatMap((r) => r.usage ?? [])
      .reduce((s, u) => s + (u.completion_tokens ?? 0), 0),
    cachedInputTokens: rows
      .flatMap((r) => r.usage ?? [])
      .reduce((s, u) => s + (u.cached_input ?? 0), 0),
    observerTokens: rows
      .flatMap((r) => r.reviews)
      .reduce((s, r) => s + (r.usage?.total_tokens ?? 0), 0),
    budgetExhaustions: rows.filter((r) =>
      /budget exhausted/i.test(r.error ?? ''),
    ).length,
    p50Ms: quantile(
      rows.map((r) => r.durationMs),
      0.5,
    ),
    p95Ms: quantile(
      rows.map((r) => r.durationMs),
      0.95,
    ),
    actions: rows.reduce((s, r) => s + r.actions.length, 0),
    noProgressScrolls: rows.reduce((s, r) => s + r.noProgressScrolls, 0),
  });
  const comparisons = {};
  for (const track of new Set(records.map((r) => r.track)))
    for (const arm of [2, 3, 'feedback']) {
      const pairs = [];
      for (const r of records.filter(
        (r) => r.track === track && r.arm === arm,
      )) {
        const control = records.find(
          (x) =>
            x.track === track &&
            x.arm === 0 &&
            x.caseId === r.caseId &&
            x.rep === r.rep,
        );
        if (control)
          pairs.push({
            caseId: r.caseId,
            delta: Number(r.success) - Number(control.success),
          });
      }
      const clusters = Array.from(new Set(pairs.map((p) => p.caseId))).map(
        (id) => {
          const p = pairs.filter((p) => p.caseId === id);
          return p.reduce((s, p) => s + p.delta, 0) / p.length;
        },
      );
      if (!clusters.length) continue;
      let seed = 12345;
      const rand = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 2 ** 32;
      };
      const draws = Array.from(
        { length: 4000 },
        () =>
          Array.from(
            { length: clusters.length },
            () => clusters[Math.floor(rand() * clusters.length)],
          ).reduce((s, x) => s + x, 0) / clusters.length,
      );
      comparisons[`${track}/${arm}-vs-0`] = {
        pairedAttempts: pairs.length,
        scenarios: clusters.length,
        delta: clusters.reduce((s, x) => s + x, 0) / clusters.length,
        interval95: [quantile(draws, 0.025), quantile(draws, 0.975)],
        note: 'Scenario-clustered paired bootstrap; pilot precision only. No significance claim from adapted development cases.',
      };
    }
  return {
    groups: Object.fromEntries(
      Object.entries(groups).map(([k, v]) => [k, aggregate(v)]),
    ),
    families: Object.fromEntries(
      [...new Set(records.map((r) => `${r.track}/${r.family}/${r.arm}`))].map(
        (key) => [
          key,
          aggregate(
            records.filter((r) => `${r.track}/${r.family}/${r.arm}` === key),
          ),
        ],
      ),
    ),
    comparisons,
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const dirs = process.argv.slice(2);
  if (!dirs.length) throw new Error('Pass run directories');
  const rows = [];
  for (const dir of dirs) {
    const manifest = JSON.parse(
      await readFile(path.join(dir, 'manifest.json'), 'utf8'),
    );
    const records = (await readFile(path.join(dir, 'results.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
    validateRun(manifest, records);
    rows.push(...records);
  }
  const result = summarize(rows);
  const output = path.join(dirs[0], 'summary.json');
  await writeFile(output, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}
