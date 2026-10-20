import { useMemo, useState } from 'react';
import type { EvaluationResult, TestcaseView } from '../types';

export function TestcaseMatrix({
  evaluationId,
  results,
  testcases,
}: {
  evaluationId: string;
  results: EvaluationResult[];
  testcases: TestcaseView[];
}) {
  const [filter, setFilter] = useState('all');
  const { models, rows } = useMemo(() => {
    const models = [
      ...new Set(results.map(({ input }) => input.displayName ?? input.model)),
    ]
      .sort()
      .reverse();
    const byTestcase = new Map<string, Map<string, EvaluationResult>>();
    for (const result of results) {
      const name = result.input.testcase;
      if (!byTestcase.has(name)) byTestcase.set(name, new Map());
      byTestcase
        .get(name)
        ?.set(result.input.displayName ?? result.input.model, result);
    }
    const rows = [
      ...new Set([...testcases.map(({ name }) => name), ...byTestcase.keys()]),
    ]
      .sort()
      .map((name) => {
        const cells = models.map((model) => byTestcase.get(name)?.get(model));
        const completed = cells.filter(Boolean).length;
        const passed = cells.filter((result) => result?.output.correct).length;
        return {
          name,
          cells,
          passed,
          status:
            completed < models.length
              ? 'incomplete'
              : passed === models.length
                ? 'all-passed'
                : passed === 0
                  ? 'all-failed'
                  : 'mixed',
        };
      });
    return { models, rows };
  }, [results, testcases]);
  const visibleRows = rows.filter(
    (row) => filter === 'all' || row.status === filter,
  );

  if (!models.length) return null;

  return (
    <section
      className="testcase-matrix"
      aria-labelledby="testcase-results-title"
    >
      <header className="testcase-matrix-heading">
        <h2 id="testcase-results-title">Testcase Pass Overview</h2>
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
        {[
          { value: 'all', label: 'All testcases' },
          { value: 'all-passed', label: 'All passed' },
          { value: 'all-failed', label: 'All failed' },
          { value: 'incomplete', label: 'Missing results' },
        ].map(({ value, label }) => (
          <button
            key={value}
            type="button"
            className="matrix-filter"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {label} (
            {value === 'all'
              ? rows.length
              : rows.filter((row) => row.status === value).length}
            )
          </button>
        ))}
      </fieldset>
      <section
        className="matrix-scroll"
        aria-label="Testcase Pass Overview"
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
                {cells.map((result, index) => (
                  <td key={models[index]}>
                    {result ? (
                      <a
                        className={`matrix-cell ${result.output.correct ? 'passed' : 'failed'}`}
                        href={`/evaluations/${encodeURIComponent(evaluationId)}/${encodeURIComponent(result.id)}`}
                        title={`${name} · ${models[index]} · ${result.output.correct ? 'Passed' : result.output.type === 'ERROR' ? 'Failed (error)' : 'Failed'}`}
                        aria-label={`${name} · ${models[index]} · ${result.output.correct ? 'Passed' : result.output.type === 'ERROR' ? 'Failed (error)' : 'Failed'}`}
                      >
                        {result.output.correct ? '✓' : '×'}
                      </a>
                    ) : (
                      <span
                        className="matrix-cell missing"
                        title={`${name} · ${models[index]} · No result`}
                        aria-label={`${name} · ${models[index]} · No result`}
                      >
                        –
                      </span>
                    )}
                  </td>
                ))}
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
