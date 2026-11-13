import { useEffect, useId, useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { UIData } from '../reporter';
import { ModelPerformanceChart } from './components/ModelPerformanceChart';
import {
  type ModelSortKey,
  type ModelSummary,
  compareNames,
  matrixRowStatus,
  resultKey,
  resultStatusLabel,
  sortModels,
  testcasePath,
} from './types';

const columns = [
  { key: 'model', label: 'Model' },
  { key: 'score', label: 'Score' },
  { key: 'totalTokens', label: 'Total Tokens', unit: 'tokens' },
  { key: 'inputTokens', label: 'Input Tokens', unit: 'tokens' },
  { key: 'outputTokens', label: 'Output Tokens', unit: 'tokens' },
  {
    key: 'estimatedCost',
    label: 'Estimated Cost',
    unit: 'USD',
    help: 'Per testcase: Input Tokens × input price + Output Tokens × output price. Includes all attempts with complete usage. Prices are per token; CNY is converted to USD using the reference exchange rate. Cache discounts and long-context surcharges are excluded.',
  },
  {
    key: 'estimatedElapsedTime',
    label: 'Estimated Model Duration',
    unit: 'seconds',
    help: 'Model average (seconds): min(Reference Estimate Avg., max(Measured Duration Avg. − 0.10, 0)). Reference estimates use Model Calls × TTFT + max(Output Tokens − Model Calls, 0) ÷ Output Throughput per testcase. Decision models use Model Calls × reference response latency. The fixed 100ms allowance is an approximation, deducted once per testcase. Negative corrected durations are clamped to zero. Each input is averaged over its own valid samples before taking the minimum. Missing measured timing uses the reference estimate.',
  },
  {
    key: 'duration',
    label: 'Measured Duration',
    unit: 'seconds',
    help: 'Actual elapsed time per testcase across all attempts. Includes image preparation, model requests, provider and network delays, retries, and local processing. Averages include valid nonnegative samples, including zero; missing values are excluded.',
  },
] as const;

function MetricHelp({ label, text }: { label: string; text: string }) {
  const id = useId();
  function show(button: HTMLButtonElement) {
    const tooltip = button.nextElementSibling as HTMLElement | null;
    if (!tooltip?.showPopover) return;
    tooltip.showPopover();
    const bounds = button.getBoundingClientRect();
    tooltip.style.left = `${Math.max(16, Math.min(bounds.right - tooltip.offsetWidth, window.innerWidth - tooltip.offsetWidth - 16))}px`;
    tooltip.style.top = `${bounds.bottom + tooltip.offsetHeight + 8 <= window.innerHeight - 16 ? bounds.bottom + 8 : Math.max(16, bounds.top - tooltip.offsetHeight - 8)}px`;
  }
  return (
    <span
      className="model-metric-help"
      onPointerLeave={(event) => {
        if (!event.currentTarget.contains(document.activeElement))
          event.currentTarget
            .querySelector<HTMLElement>('[popover]')
            ?.hidePopover?.();
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          event.currentTarget
            .querySelector<HTMLElement>('[popover]')
            ?.hidePopover?.();
      }}
    >
      <button
        type="button"
        className="model-metric-help-trigger"
        aria-label={`How ${label} Avg. Is Calculated`}
        aria-describedby={id}
        onPointerEnter={(event) => show(event.currentTarget)}
        onFocus={(event) => show(event.currentTarget)}
        onClick={(event) => show(event.currentTarget)}
      >
        <svg
          aria-hidden="true"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4" />
          <circle cx="12" cy="16.5" r=".8" fill="currentColor" stroke="none" />
        </svg>
      </button>
      <span
        className="model-metric-help-tooltip"
        role="tooltip"
        id={id}
        ref={(element) => element?.setAttribute('popover', 'auto')}
      >
        <strong>{label} Avg.</strong>
        <span className="model-metric-help-formula">{text}</span>
        <span>
          Arithmetic means include valid samples across all outcomes, including
          zero. Missing values are excluded. Coverage is shown in the table.
        </span>
      </span>
    </span>
  );
}

function Reference({ model }: { model: ModelSummary }) {
  const ref = model.reference;
  if (!ref) return <span>No reference data</span>;
  const performance = ref.performance;
  const pricing = ref.pricing;
  return (
    <details>
      <summary>{ref.source}</summary>
      <div className="model-breakdown-reference-details">
        <p>
          {performance?.basis === 'best-response-latency'
            ? 'P50 response latency'
            : performance?.basis === 'best-per-metric'
              ? 'Best P50'
              : performance?.basis === 'mixed-source'
                ? 'Mixed performance references'
                : performance
                  ? 'Benchmark mean'
                  : 'Pricing only'}{' '}
          · {(performance?.observedAt ?? ref.observedAt).slice(0, 10)}
        </p>
        {performance ? (
          <p>
            {performance.basis === 'best-response-latency'
              ? `${(performance.responseLatencyMs / 1000).toFixed(2)} s per call`
              : `TTFT ${(performance.timeToFirstTokenMs / 1000).toFixed(2)} s · ${performance.outputTokensPerSecond.toLocaleString('en-US', { maximumFractionDigits: 2 })} tokens/s`}
          </p>
        ) : (
          <p>No performance reference for this model version.</p>
        )}
        {pricing ? (
          <>
            <p>
              {pricing.currency === 'CNY' ? '¥' : '$'}
              {pricing.inputPerToken * 1_000_000} in /{' '}
              {pricing.currency === 'CNY' ? '¥' : '$'}
              {pricing.outputPerToken * 1_000_000} out per 1M tokens
            </p>
            {pricing.currency === 'CNY' && (
              <p>¥{pricing.usdExchangeRate.cnyPerUsd} = $1</p>
            )}
          </>
        ) : (
          <p>No pricing reference for this model version.</p>
        )}
        {ref.note && <p>{ref.note}</p>}
        <a href={ref.url} target="_blank" rel="noreferrer">
          Source ↗
        </a>
        {performance && 'url' in performance && performance.url && (
          <p>
            <a href={performance.url} target="_blank" rel="noreferrer">
              Performance source ↗
            </a>
          </p>
        )}
        {performance &&
          'timeToFirstTokenUrl' in performance &&
          performance.timeToFirstTokenUrl && (
            <p>
              <a
                href={performance.timeToFirstTokenUrl}
                target="_blank"
                rel="noreferrer"
              >
                TTFT source ↗
              </a>
            </p>
          )}
      </div>
    </details>
  );
}

export function Performance({ data }: { data: UIData }) {
  const models = data.summaries?.models ?? [];
  useEffect(() => {
    function dismissHelp() {
      document
        .querySelectorAll<HTMLElement>(
          '.model-metric-help-tooltip:popover-open',
        )
        .forEach((tooltip) => tooltip.hidePopover());
    }
    window.addEventListener('scroll', dismissHelp, true);
    window.addEventListener('resize', dismissHelp);
    return () => {
      window.removeEventListener('scroll', dismissHelp, true);
      window.removeEventListener('resize', dismissHelp);
    };
  }, []);
  const [sort, setSort] = useState<{
    key: ModelSortKey;
    direction: 'ascending' | 'descending';
  }>({ key: 'model', direction: 'descending' });
  const sorted = useMemo(
    () => sortModels(models, sort.key, sort.direction),
    [models, sort],
  );
  return (
    <>
      <ModelPerformanceChart models={models} />
      <section
        className="model-breakdown"
        aria-labelledby="model-breakdown-title"
      >
        <header className="model-breakdown-heading">
          <h2 id="model-breakdown-title">Model Performance Breakdown</h2>
        </header>
        <section
          className="model-breakdown-scroll"
          aria-label="Model performance metrics"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: The wide table supports keyboard scrolling.
          tabIndex={0}
        >
          <table
            className="model-breakdown-table"
            aria-labelledby="model-breakdown-title"
          >
            <thead>
              <tr>
                {columns.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={
                      sort.key === column.key ? sort.direction : 'none'
                    }
                  >
                    <div className="model-breakdown-column-header">
                      <button
                        type="button"
                        className="model-breakdown-sort"
                        aria-label={`${column.label}${'unit' in column ? ' Avg.' : ''}`}
                        onClick={() =>
                          setSort((current) => ({
                            key: column.key,
                            direction:
                              current.key === column.key
                                ? current.direction === 'ascending'
                                  ? 'descending'
                                  : 'ascending'
                                : column.key === 'score'
                                  ? 'descending'
                                  : 'ascending',
                          }))
                        }
                      >
                        <span>{column.label}</span>
                        <span
                          className="model-breakdown-sort-icon"
                          aria-hidden="true"
                        >
                          {sort.key !== column.key
                            ? '↕'
                            : sort.direction === 'ascending'
                              ? '↑'
                              : '↓'}
                        </span>
                      </button>
                      {'unit' in column && (
                        <span className="model-breakdown-average">
                          Avg.
                          {'help' in column && (
                            <MetricHelp
                              label={column.label}
                              text={column.help}
                            />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                ))}
                <th scope="col">Reference</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((model) => (
                <tr key={model.model}>
                  <th scope="row">
                    <strong className="model-breakdown-name">
                      {model.model}
                    </strong>
                    <Link
                      className="model-breakdown-link"
                      to={testcasePath(data.testcases[0]?.name, model.model)}
                      aria-label={`View details for ${model.model}`}
                    >
                      View details →
                    </Link>
                  </th>
                  <td>
                    <strong
                      className="model-breakdown-score"
                      title="Score = correct results ÷ available final results × 100. Errors receive zero credit; missing results are excluded."
                    >
                      {model.score === null ? '—' : model.score.toFixed(1)}
                    </strong>
                    <small>
                      {model.passed} / {model.count} correct
                    </small>
                    {model.missing > 0 && (
                      <small>{model.missing} missing results</small>
                    )}
                    {model.errors > 0 && <small>{model.errors} errors</small>}
                  </td>
                  {columns
                    .filter((column) => 'unit' in column)
                    .map((column) => {
                      const metric = model[column.key];
                      return (
                        <td key={column.key}>
                          {metric.average === null
                            ? '—'
                            : column.unit === 'seconds'
                              ? `${(metric.average / 1000).toFixed(2)} s`
                              : column.unit === 'USD'
                                ? `$${metric.average.toFixed(6)}`
                                : metric.average.toLocaleString('en-US', {
                                    maximumFractionDigits: 0,
                                  })}
                          {metric.count !== model.count && (
                            <small>
                              {metric.count} / {model.count} valid results
                            </small>
                          )}
                          {column.key === 'totalTokens' &&
                            (model.usage.partial > 0 ||
                              model.usage.missing > 0) && (
                              <small>
                                {model.usage.complete} complete ·{' '}
                                {model.usage.partial} partial ·{' '}
                                {model.usage.missing} missing usage
                              </small>
                            )}
                        </td>
                      );
                    })}
                  <td className="model-breakdown-reference">
                    <Reference model={model} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </section>
      <TestcaseMatrix data={data} />
    </>
  );
}

export function TestcaseMatrix({ data }: { data: UIData }) {
  const [filter, setFilter] = useState('all');
  const { models, rows, counts } = useMemo(() => {
    const models = (data.run?.models.map((model) => model.displayName) ?? [])
      .sort(compareNames)
      .reverse();
    const byKey = new Map(
      data.results?.map((result) => [
        resultKey(result.input.testcase, result.input.displayName),
        result,
      ]),
    );
    const counts = { 'all-passed': 0, 'all-failed': 0, incomplete: 0 };
    const rows = [...data.testcases]
      .sort((a, b) => compareNames(a.name, b.name))
      .map(({ name }) => {
        const cells = models.map((model) => byKey.get(resultKey(name, model)));
        const passed = cells.filter((result) => result?.output.correct).length;
        const status = matrixRowStatus(cells);
        if (status !== 'mixed') counts[status]++;
        return { name, cells, passed, status };
      });
    return { models, rows, counts: { all: rows.length, ...counts } };
  }, [data]);
  const scores =
    data.summaries?.models.flatMap((model) =>
      model.score === null ? [] : [model.score],
    ) ?? [];
  const mean = scores.length
    ? scores.reduce((sum, score) => sum + score, 0) / scores.length
    : null;
  const deviation =
    mean === null
      ? null
      : Math.sqrt(
          scores.reduce((sum, score) => sum + (score - mean) ** 2, 0) /
            scores.length,
        );
  const visible =
    filter === 'all' ? rows : rows.filter((row) => row.status === filter);
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
            title="Population standard deviation of available model scores. Each model has equal weight; filters do not change this value."
          >
            Score Std. Dev.
            <strong>
              {deviation === null ? '—' : deviation.toFixed(2)} points
            </strong>
          </span>
        </div>
        <div className="matrix-legend" aria-label="Result Colors">
          {['passed', 'failed', 'missing'].map((status) => (
            <span key={status}>
              <span className={`matrix-swatch ${status}`} aria-hidden="true" />
              {status === 'passed'
                ? 'Passed'
                : status === 'failed'
                  ? 'Failed'
                  : 'No result'}
            </span>
          ))}
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
        // biome-ignore lint/a11y/noNoninteractiveTabindex: The wide matrix supports keyboard scrolling.
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
            {visible.map(({ name, cells, passed, status }) => (
              <tr key={name} data-status={status}>
                <th scope="row">
                  <Link className="matrix-case-link" to={testcasePath(name)}>
                    {name}
                  </Link>
                </th>
                <td className="matrix-pass-count">
                  <span title={`${passed} of ${models.length} models passed`}>
                    {passed} / {models.length}
                  </span>
                </td>
                {cells.map((result, index) => {
                  const label = `${name} · ${models[index]} · ${resultStatusLabel(result)}`;
                  return (
                    <td key={models[index]}>
                      <Link
                        className={`matrix-cell ${!result ? 'missing' : result.output.correct ? 'passed' : 'failed'}`}
                        to={testcasePath(name, models[index])}
                        title={label}
                        aria-label={label}
                      >
                        {!result ? '–' : result.output.correct ? '✓' : '×'}
                      </Link>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {!visible.length && (
        <p className="list-empty">No testcases match this filter.</p>
      )}
    </section>
  );
}
