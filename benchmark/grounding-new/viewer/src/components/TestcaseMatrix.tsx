import { useMemo, useState } from 'react';
import {
  type EvaluationResult,
  type TestcaseView,
  getModelDisplayName,
} from '../types';

export function TestcaseMatrix({
  evaluationId,
  results,
  testcases,
  modelScores,
}: {
  evaluationId: string;
  results: EvaluationResult[];
  testcases: TestcaseView[];
  modelScores: number[];
}) {
  const [filter, setFilter] = useState('all');
  const { models, rows, counts } = useMemo(() => {
    const models = [...new Set(results.map(getModelDisplayName))]
      .sort()
      .reverse();
    const byTestcase = new Map<string, Map<string, EvaluationResult>>();
    for (const result of results) {
      const name = result.input.testcase;
      const cells = byTestcase.get(name) ?? new Map();
      cells.set(getModelDisplayName(result), result);
      byTestcase.set(name, cells);
    }
    const counts = {
      'all-passed': 0,
      'all-failed': 0,
      incomplete: 0,
    };
    const rows = [
      ...new Set([...testcases.map(({ name }) => name), ...byTestcase.keys()]),
    ]
      .sort()
      .map((name) => {
        const results = byTestcase.get(name);
        const cells = models.map((model) => results?.get(model));
        const passed = cells.filter((result) => result?.output.correct).length;
        const status = cells.some((result) => !result)
          ? 'incomplete'
          : passed === models.length
            ? 'all-passed'
            : passed === 0
              ? 'all-failed'
              : 'mixed';
        if (status !== 'mixed') counts[status]++;
        return {
          name,
          cells,
          passed,
          status,
        };
      });
    return { models, rows, counts: { all: rows.length, ...counts } };
  }, [results, testcases]);
  const visibleRows =
    filter === 'all' ? rows : rows.filter((row) => row.status === filter);

  if (!models.length) return null;

  const meanScore =
    modelScores.reduce((sum, score) => sum + score, 0) / modelScores.length;
  const scoreStandardDeviation = Math.sqrt(
    modelScores.reduce((sum, score) => sum + (score - meanScore) ** 2, 0) /
      modelScores.length,
  );

  return (
    <section
      className="testcase-matrix"
      aria-labelledby="testcase-results-title"
    >
      <header className="testcase-matrix-heading">
        <div className="matrix-title">
          <h2 id="testcase-results-title">Testcase Score Overview</h2>
          <span
            className="matrix-score-spread"
            title={`Population standard deviation of the overall scores of all ${modelScores.length} models, in score points on a 0–100 scale. Each model has equal weight. Errors receive zero credit; missing results are excluded. Unaffected by filters.`}
          >
            Score Std. Dev.
            <strong>
              {scoreStandardDeviation.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{' '}
              points
            </strong>
          </span>
        </div>
        <div className="matrix-legend" aria-label="Result Colors">
          <span>
            <span className="matrix-swatch passed" aria-hidden="true" />
            Passed
          </span>
          <span>
            <span className="matrix-swatch failed" aria-hidden="true" />
            Failed
          </span>
          <span>
            <span className="matrix-swatch missing" aria-hidden="true" />
            No result
          </span>
        </div>
      </header>
      <fieldset className="matrix-filters" aria-label="Filter testcase results">
        {(
          [
            { value: 'all', label: 'All testcases' },
            { value: 'all-passed', label: 'All passed' },
            { value: 'all-failed', label: 'All failed' },
            { value: 'incomplete', label: 'Missing results' },
          ] as const
        ).map(({ value, label }) => (
          <button
            key={value}
            type="button"
            className="matrix-filter"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {label} ({counts[value]})
          </button>
        ))}
      </fieldset>
      <section
        className="matrix-scroll"
        aria-label="Testcase Score Overview"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: The scrollable matrix must support keyboard scrolling.
        tabIndex={0}
      >
        <table
          className="result-matrix"
          style={{ minWidth: 284 + models.length * 84 }}
        >
          <colgroup>
            <col style={{ width: 220 }} />
            <col style={{ width: 64 }} />
            {models.map((model) => (
              <col key={model} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th scope="col">Testcase</th>
              <th scope="col">Passed</th>
              {models.map((model) => (
                <th key={model} scope="col" className="matrix-model">
                  {model}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(({ name, cells, passed, status }) => (
              <tr key={name} data-status={status}>
                <th scope="row">
                  <a
                    className="matrix-case-link"
                    href={`/testcases/${encodeURIComponent(name)}`}
                  >
                    {name}
                  </a>
                </th>
                <td className="matrix-pass-count">
                  <span title={`${passed} of ${models.length} models passed`}>
                    {passed} / {models.length}
                  </span>
                </td>
                {cells.map((result, index) => {
                  const status = !result
                    ? 'No result'
                    : result.output.correct
                      ? 'Passed'
                      : result.output.type === 'ERROR'
                        ? 'Failed (error)'
                        : 'Failed';
                  const label = `${name} · ${models[index]} · ${status}`;
                  return (
                    <td key={models[index]}>
                      {result ? (
                        <a
                          className={`matrix-cell ${result.output.correct ? 'passed' : 'failed'}`}
                          href={`/evaluations/${encodeURIComponent(evaluationId)}/${encodeURIComponent(result.id)}`}
                          title={label}
                          aria-label={label}
                        >
                          {result.output.correct ? '✓' : '×'}
                        </a>
                      ) : (
                        <span
                          className="matrix-cell missing"
                          title={label}
                          aria-label={label}
                        >
                          –
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {!visibleRows.length && (
        <p className="list-empty">No testcases match this filter.</p>
      )}
    </section>
  );
}
