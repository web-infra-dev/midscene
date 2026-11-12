import {
  StrictMode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createRoot } from 'react-dom/client';
import type { ViewerConfig } from '../../config';
import { DetailsPanel } from './components/DetailsPanel';
import { Filters as FilterBar } from './components/Filters';
import { ModelPerformanceChart } from './components/ModelPerformanceChart';
import { ResultPanel, ResultStatus } from './components/ResultPanel';
import { ScreenshotPanel } from './components/ScreenshotPanel';
import { TestcaseMatrix } from './components/TestcaseMatrix';
import {
  type EvaluationResult,
  type Filters,
  type TestcaseView,
  getModelDisplayName,
} from './types';
import './styles.css';

const emptyFilters: Filters = {
  search: '',
  platform: '',
  category: '',
  dataset: '',
  outcome: '',
};

type CandidateBatch = { number: number; candidates: string[] };

function compareNames(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function filterTestcases(testcases: TestcaseView[], filters: Filters) {
  const terms = filters.search
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return testcases.filter((testcase) => {
    const searchable = terms.length
      ? `${testcase.name}\n${testcase.instruction.en}\n${testcase.instruction.zh}`.toLowerCase()
      : '';
    return (
      terms.every((term) => searchable.includes(term)) &&
      (!filters.platform || testcase.platform === filters.platform) &&
      (!filters.category || testcase.category.item === filters.category) &&
      (!filters.dataset || testcase.reference.dataset === filters.dataset) &&
      (!filters.outcome ||
        (testcase.groundTruth === 'REFUSAL' ? 'refusal' : 'point') ===
          filters.outcome)
    );
  });
}

function summarize(values: (number | undefined)[]) {
  const samples = values.filter(
    (value): value is number =>
      value !== undefined && Number.isFinite(value) && value >= 0,
  );
  return {
    average: samples.length
      ? samples.reduce((total, value) => total + value, 0) / samples.length
      : null,
    count: samples.length,
  };
}

const modelColumns = [
  { key: 'model', label: 'Model' },
  { key: 'score', label: 'Score' },
  { key: 'totalTokens', label: 'Total Tokens', unit: 'tokens' },
  { key: 'inputTokens', label: 'Input Tokens', unit: 'tokens' },
  { key: 'outputTokens', label: 'Output Tokens', unit: 'tokens' },
  {
    key: 'estimatedCost',
    label: 'Estimated Cost',
    unit: 'USD',
    help: {
      formula:
        'Per testcase: Input Tokens × input price + Output Tokens × output price.',
      note: 'Prices are per token. CNY amounts are converted to USD using the reference exchange rate. Cache discounts and long-context surcharges are excluded.',
    },
  },
  {
    key: 'estimatedElapsedTime',
    label: 'Estimated Model Duration',
    unit: 'seconds',
    help: {
      formula:
        'Model average (seconds): min(Reference Estimate Avg., max(Measured Duration Avg. − 0.15, 0)).',
      note: 'Reference estimates use Model Calls × TTFT + max(Output Tokens − Model Calls, 0) ÷ Output Throughput per testcase, with sequential calls and TTFT in seconds. Decision models use Model Calls × reference response latency. Each input is averaged over its own valid samples before taking the minimum. The fixed 150ms network-delay allowance is deducted once per testcase, not per call. This approximates core model response time; local overhead may remain. If measured timing is unavailable, the reference estimate is used.',
    },
  },
  {
    key: 'duration',
    label: 'Measured Duration',
    unit: 'seconds',
    help: {
      formula:
        'Actual elapsed time per testcase, from test execution start through agent cleanup, before the result is written to disk.',
      note: 'Includes image preparation, model requests, network and provider delays, retries, and local processing. Estimated Model Duration approximates core model response time by taking the smaller of the reference-based average and this measured average minus a fixed 150ms network-delay allowance, with a minimum of zero.',
    },
  },
] as const;

const metricColumns = modelColumns.filter((column) => 'unit' in column);

function showMetricHelp(button: HTMLButtonElement) {
  const tooltip = button.nextElementSibling as HTMLElement;
  tooltip.showPopover();
  const bounds = button.getBoundingClientRect();
  tooltip.style.left = `${Math.max(16, Math.min(bounds.right - tooltip.offsetWidth, window.innerWidth - tooltip.offsetWidth - 16))}px`;
  tooltip.style.top = `${
    bounds.bottom + tooltip.offsetHeight + 8 <= window.innerHeight - 16
      ? bounds.bottom + 8
      : Math.max(16, bounds.top - tooltip.offsetHeight - 8)
  }px`;
}

function EvaluationReport({
  evaluationId,
  results,
  testcases,
  config,
}: {
  evaluationId: string;
  results: EvaluationResult[];
  testcases: TestcaseView[];
  config: ViewerConfig;
}) {
  const evaluationPath = `/evaluations/${encodeURIComponent(evaluationId)}`;
  const [sort, setSort] = useState<{
    key: (typeof modelColumns)[number]['key'];
    direction: 'ascending' | 'descending';
  }>({ key: 'model', direction: 'descending' });
  useEffect(() => {
    const dismissHelp = (event: Event) => {
      if (
        event.target instanceof Element &&
        event.target.closest('.model-metric-help-tooltip')
      )
        return;
      for (const tooltip of document.querySelectorAll<HTMLElement>(
        '.model-metric-help-tooltip:popover-open',
      )) {
        tooltip.hidePopover();
      }
    };
    window.addEventListener('scroll', dismissHelp, true);
    window.addEventListener('resize', dismissHelp);
    return () => {
      window.removeEventListener('scroll', dismissHelp, true);
      window.removeEventListener('resize', dismissHelp);
    };
  }, []);
  const modelSummaries = useMemo(() => {
    const configuredModels = new Map(
      config.models.map((model) => [model.displayName ?? model.name, model]),
    );
    const groups = new Map<string, EvaluationResult[]>();
    for (const result of results) {
      const model = getModelDisplayName(result);
      const group = groups.get(model);
      if (group) group.push(result);
      else groups.set(model, [result]);
    }
    return [...groups]
      .sort(([left], [right]) => compareNames(right, left))
      .map(([model, modelResults]) => {
        const modelId = modelResults[0].input.model;
        const configuredModel = configuredModels.get(model);
        const reference = configuredModel?.reference;
        const family = configuredModel?.displayFamily ?? 'Other';
        const { color, logo } = config.families[family];
        const currencyPerUsd =
          reference?.pricing.currency === 'CNY'
            ? reference.pricing.usdExchangeRate.cnyPerUsd
            : 1;
        const estimates = modelResults.map(({ profiling }) => {
          const {
            totalPromptTokens: input,
            totalCompletionTokens: output,
            calls,
          } = profiling;
          if (
            profiling.byModel &&
            Object.keys(profiling.byModel).some((name) => name !== modelId)
          ) {
            return {};
          }
          return {
            durationMs:
              reference?.performance &&
              calls !== undefined &&
              Number.isInteger(calls) &&
              calls > 0
                ? reference.performance.basis === 'best-response-latency'
                  ? calls * reference.performance.responseLatencyMs
                  : output !== undefined &&
                      Number.isFinite(output) &&
                      output >= 0
                    ? calls * reference.performance.timeToFirstTokenMs +
                      (1000 * Math.max(output - calls, 0)) /
                        reference.performance.outputTokensPerSecond
                    : undefined
                : undefined,
            cost:
              reference?.pricing &&
              input !== undefined &&
              Number.isFinite(input) &&
              input >= 0 &&
              output !== undefined &&
              Number.isFinite(output) &&
              output >= 0
                ? (input * reference.pricing.inputPerToken +
                    output * reference.pricing.outputPerToken) /
                  currencyPerUsd
                : undefined,
          };
        });
        const passed = modelResults.filter(
          (result) => result.output.correct,
        ).length;
        const duration = summarize(
          modelResults.map(({ profiling }) => profiling.durationMs),
        );
        const referenceDuration = summarize(
          estimates.map(({ durationMs }) => durationMs),
        );
        const estimatedElapsedTime = {
          ...referenceDuration,
          average:
            referenceDuration.average === null || duration.average === null
              ? referenceDuration.average
              : Math.min(
                  referenceDuration.average,
                  Math.max(0, duration.average - 150),
                ),
        };
        return {
          model,
          modelId,
          family,
          color,
          icon: logo,
          reference,
          count: modelResults.length,
          passed,
          score: (passed / modelResults.length) * 100,
          totalTokens: summarize(
            modelResults.map(({ profiling }) => profiling.totalTokens),
          ),
          inputTokens: summarize(
            modelResults.map(({ profiling }) => profiling.totalPromptTokens),
          ),
          outputTokens: summarize(
            modelResults.map(
              ({ profiling }) => profiling.totalCompletionTokens,
            ),
          ),
          duration,
          estimatedElapsedTime,
          estimatedCost: summarize(estimates.map(({ cost }) => cost)),
          unavailableReason: !reference
            ? 'Missing pricing and performance data'
            : !reference.performance
              ? 'Missing performance data for this model version'
              : modelResults.every(({ output }) => output.type === 'ERROR')
                ? 'All requests failed; no valid token usage'
                : 'No valid token usage',
          first: modelResults[0],
        };
      });
  }, [results, config]);
  const sortedModels = [...modelSummaries].sort((left, right) => {
    const [leftValue, rightValue] = [left, right].map((summary) => {
      if (sort.key === 'model') return summary.model;
      if (sort.key === 'score') return summary.score;
      return summary[sort.key].average;
    });
    if (leftValue === null)
      return rightValue === null ? compareNames(right.model, left.model) : 1;
    if (rightValue === null) return -1;
    const comparison =
      typeof leftValue === 'number' && typeof rightValue === 'number'
        ? leftValue - rightValue
        : compareNames(String(leftValue), String(rightValue));
    return (
      (sort.direction === 'ascending' ? comparison : -comparison) ||
      compareNames(right.model, left.model)
    );
  });

  const performanceModels = useMemo(
    () =>
      modelSummaries.map(
        ({
          model,
          family,
          color,
          icon,
          score,
          estimatedElapsedTime,
          estimatedCost,
          unavailableReason,
        }) => ({
          model,
          family,
          color,
          icon,
          score,
          estimatedCostUsd: estimatedCost.average,
          estimatedElapsedTimeSeconds:
            estimatedElapsedTime.average === null
              ? null
              : estimatedElapsedTime.average / 1000,
          testcasesPerMinute:
            estimatedElapsedTime.average !== null &&
            estimatedElapsedTime.average > 0
              ? 60_000 / estimatedElapsedTime.average
              : null,
          testcasesPerDollar:
            estimatedCost.average !== null && estimatedCost.average > 0
              ? 1 / estimatedCost.average
              : null,
          unavailableReason:
            estimatedElapsedTime.average === 0 || estimatedCost.average === 0
              ? 'Cost or duration is zero; rate unavailable'
              : estimatedElapsedTime.average === null ||
                  estimatedCost.average === null
                ? unavailableReason
                : null,
        }),
      ),
    [modelSummaries],
  );

  return modelSummaries.length ? (
    <>
      <ModelPerformanceChart models={performanceModels} />
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
          // biome-ignore lint/a11y/noNoninteractiveTabindex: The wide table must support keyboard scrolling.
          tabIndex={0}
        >
          <table
            className="model-breakdown-table"
            aria-labelledby="model-breakdown-title"
          >
            <thead>
              <tr>
                {modelColumns.map((column) => {
                  const { key, label } = column;
                  return (
                    <th
                      key={key}
                      scope="col"
                      aria-sort={sort.key === key ? sort.direction : 'none'}
                    >
                      <div className="model-breakdown-column-header">
                        <button
                          type="button"
                          className="model-breakdown-sort"
                          aria-label={`${label}${'unit' in column ? ' Avg.' : ''}`}
                          onClick={() =>
                            setSort((previous) => ({
                              key,
                              direction:
                                previous.key === key
                                  ? previous.direction === 'ascending'
                                    ? 'descending'
                                    : 'ascending'
                                  : key === 'score'
                                    ? 'descending'
                                    : 'ascending',
                            }))
                          }
                        >
                          <span>{label}</span>
                          <span
                            className="model-breakdown-sort-icon"
                            aria-hidden="true"
                          >
                            {sort.key !== key
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
                              <span
                                className="model-metric-help"
                                onPointerLeave={(event) => {
                                  if (
                                    !event.currentTarget.contains(
                                      document.activeElement,
                                    )
                                  ) {
                                    event.currentTarget
                                      .querySelector<HTMLElement>('[popover]')
                                      ?.hidePopover();
                                  }
                                }}
                                onBlur={(event) => {
                                  if (
                                    !event.currentTarget.contains(
                                      event.relatedTarget,
                                    )
                                  ) {
                                    event.currentTarget
                                      .querySelector<HTMLElement>('[popover]')
                                      ?.hidePopover();
                                  }
                                }}
                              >
                                <button
                                  type="button"
                                  className="model-metric-help-trigger"
                                  aria-label={`How ${label} Avg. Is Calculated`}
                                  aria-describedby={`model-metric-help-${key}`}
                                  onPointerEnter={(event) =>
                                    showMetricHelp(event.currentTarget)
                                  }
                                  onFocus={(event) =>
                                    showMetricHelp(event.currentTarget)
                                  }
                                  onClick={(event) =>
                                    showMetricHelp(event.currentTarget)
                                  }
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
                                    <circle
                                      cx="12"
                                      cy="16.5"
                                      r=".8"
                                      fill="currentColor"
                                      stroke="none"
                                    />
                                  </svg>
                                </button>
                                <span
                                  className="model-metric-help-tooltip"
                                  role="tooltip"
                                  id={`model-metric-help-${key}`}
                                  popover="auto"
                                >
                                  <strong>{label} Avg.</strong>
                                  <span className="model-metric-help-formula">
                                    {column.help.formula}
                                  </span>
                                  <span>{column.help.note}</span>
                                  <span>
                                    {key === 'estimatedElapsedTime'
                                      ? 'Both inputs use arithmetic means of valid samples across all outcomes, including zero. Missing values are excluded. The minimum is applied after averaging.'
                                      : 'Avg. is the arithmetic mean of valid per-testcase values across all outcomes, including zero. Missing values are excluded.'}
                                  </span>
                                </span>
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                    </th>
                  );
                })}
                <th scope="col">Reference</th>
              </tr>
            </thead>
            <tbody>
              {sortedModels.map((summary) => {
                const { model, reference, count, passed, score, first } =
                  summary;
                return (
                  <tr key={model}>
                    <th scope="row">
                      <strong className="model-breakdown-name">{model}</strong>
                      <a
                        className="model-breakdown-link"
                        href={`${evaluationPath}/${encodeURIComponent(first.id)}`}
                        aria-label={`View details for ${model}`}
                      >
                        View details →
                      </a>
                    </th>
                    <td>
                      <strong
                        className="model-breakdown-score"
                        title="Score = correct results ÷ all available results × 100. Errors receive zero credit; missing results are excluded."
                      >
                        {score.toFixed(1)}
                      </strong>
                      <small>
                        {passed} / {count} correct
                      </small>
                    </td>
                    {metricColumns.map(({ key, unit }) => {
                      const values = summary[key];
                      return (
                        <td key={key}>
                          {values.average === null
                            ? '—'
                            : unit === 'seconds'
                              ? `${(values.average / 1000).toFixed(2)} s`
                              : unit === 'USD'
                                ? `$${values.average.toFixed(6)}`
                                : values.average.toLocaleString('en-US', {
                                    maximumFractionDigits: 0,
                                  })}
                          {values.count !== count && (
                            <small>
                              {values.count} / {count} valid results
                            </small>
                          )}
                        </td>
                      );
                    })}
                    <td className="model-breakdown-reference">
                      {reference ? (
                        <details>
                          <summary>{reference.source}</summary>
                          <div className="model-breakdown-reference-details">
                            <p>
                              {reference.performance?.basis ===
                              'best-per-metric'
                                ? 'Best P50'
                                : reference.performance?.basis ===
                                    'best-response-latency'
                                  ? 'P50 response latency'
                                  : reference.performance?.basis ===
                                      'mixed-source'
                                    ? 'Mixed performance references'
                                    : reference.performance
                                      ? 'Benchmark mean'
                                      : 'Pricing only'}{' '}
                              ·{' '}
                              {(
                                reference.performance?.observedAt ??
                                reference.observedAt
                              ).slice(0, 10)}
                            </p>
                            {reference.performance ? (
                              reference.performance.basis ===
                              'best-response-latency' ? (
                                <>
                                  <p>
                                    {(
                                      reference.performance.responseLatencyMs /
                                      1000
                                    ).toFixed(2)}{' '}
                                    s per call
                                  </p>
                                  <p>Not specific to image or Box requests.</p>
                                </>
                              ) : (
                                <p>
                                  TTFT{' '}
                                  {(
                                    reference.performance.timeToFirstTokenMs /
                                    1000
                                  ).toFixed(2)}{' '}
                                  s ·{' '}
                                  {reference.performance.outputTokensPerSecond.toLocaleString(
                                    'en-US',
                                    { maximumFractionDigits: 2 },
                                  )}{' '}
                                  tokens/s
                                </p>
                              )
                            ) : (
                              <p>
                                No performance reference for this model version.
                              </p>
                            )}
                            <p>
                              {reference.pricing.currency === 'CNY' ? '¥' : '$'}
                              {reference.pricing.inputPerToken * 1_000_000} in /{' '}
                              {reference.pricing.currency === 'CNY' ? '¥' : '$'}
                              {reference.pricing.outputPerToken * 1_000_000} out
                              per 1M tokens
                            </p>
                            {reference.pricing.currency === 'CNY' && (
                              <p>
                                ¥{reference.pricing.usdExchangeRate.cnyPerUsd} =
                                $1
                              </p>
                            )}
                            {'note' in reference && <p>{reference.note}</p>}
                            <a
                              href={reference.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Source ↗
                            </a>
                            {reference.performance &&
                              'url' in reference.performance && (
                                <p>
                                  <a
                                    href={reference.performance.url}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    Performance source ↗
                                  </a>
                                </p>
                              )}
                            {reference.performance &&
                              'timeToFirstTokenUrl' in
                                reference.performance && (
                                <>
                                  <p>{reference.performance.conditions}</p>
                                  <p>
                                    <a
                                      href={
                                        reference.performance
                                          .timeToFirstTokenUrl
                                      }
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      TTFT source ↗
                                    </a>
                                  </p>
                                </>
                              )}
                          </div>
                        </details>
                      ) : (
                        <span>No reference data</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </section>
      <TestcaseMatrix
        evaluationId={evaluationId}
        results={results}
        testcases={testcases}
        modelScores={performanceModels.map(({ score }) => score)}
      />
    </>
  ) : (
    <p className="list-empty">No results for this evaluation yet.</p>
  );
}

function App() {
  const [pathname, setPathname] = useState(window.location.pathname);
  const [testcases, setTestcases] = useState<TestcaseView[]>([]);
  const [config, setConfig] = useState<ViewerConfig | null>(null);
  const [candidates, setCandidates] = useState<TestcaseView[]>([]);
  const [candidateBatches, setCandidateBatches] = useState<CandidateBatch[]>(
    [],
  );
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [zoom, setZoom] = useState<'fit' | 'actual'>('fit');
  const [showGT, setShowGT] = useState(true);
  const [showPrediction, setShowPrediction] = useState(true);
  const [evaluations, setEvaluations] = useState<string[] | null>(null);
  const [evaluationData, setEvaluationData] = useState<{
    evaluationId: string;
    results: EvaluationResult[];
  } | null>(null);
  const [evaluationError, setEvaluationError] = useState('');
  const [loadStatus, setLoadStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [loadError, setLoadError] = useState('');
  const [candidateLoadStatus, setCandidateLoadStatus] = useState<
    'loading' | 'ready' | 'error'
  >('loading');
  const [candidateLoadError, setCandidateLoadError] = useState('');
  const [loadRevision, setLoadRevision] = useState(0);
  const caseLinks = useRef(new Map<string, HTMLAnchorElement>());
  const parts = useMemo(() => {
    try {
      return pathname.split('/').filter(Boolean).map(decodeURIComponent);
    } catch {
      return [];
    }
  }, [pathname]);
  const isTestcases = parts[0] === 'testcases' && parts.length <= 2;
  const isCandidates = parts[0] === 'candidates' && parts.length <= 2;
  const isCaseBrowser = isTestcases || isCandidates;
  const casePath = isCandidates ? '/candidates' : '/testcases';
  const candidateBatch = isCandidates
    ? (candidateBatches.find((batch) => batch.candidates.includes(parts[1])) ??
      candidateBatches.at(-1))
    : undefined;
  const activeTestcases = useMemo(() => {
    if (!isCandidates) return testcases;
    if (!candidateBatch) return candidates;
    const names = new Set(candidateBatch.candidates);
    return candidates.filter((testcase) => names.has(testcase.name));
  }, [isCandidates, testcases, candidates, candidateBatch]);
  const activeLoadStatus = isCandidates ? candidateLoadStatus : loadStatus;
  const isEvaluations = parts[0] === 'evaluations' && parts.length <= 3;
  const evaluationId = isEvaluations ? (parts[1] ?? '') : '';
  const resultId = isEvaluations && parts.length === 3 ? parts[2] : undefined;
  const scope = isCandidates
    ? `${casePath}:${candidateBatch?.number ?? ''}`
    : isTestcases
      ? casePath
      : evaluationId;
  const evaluationPath = `/evaluations/${encodeURIComponent(evaluationId)}`;
  const results = useMemo(
    () =>
      evaluationData?.evaluationId === evaluationId
        ? evaluationData.results
        : [],
    [evaluationData, evaluationId],
  );
  const casesByName = useMemo(
    () => new Map(activeTestcases.map((testcase) => [testcase.name, testcase])),
    [activeTestcases],
  );
  const filtered = useMemo(
    () => filterTestcases(activeTestcases, filters),
    [activeTestcases, filters],
  );
  const selectedResult = useMemo(
    () =>
      resultId ? results.find((result) => result.id === resultId) : undefined,
    [results, resultId],
  );
  const selectedModel = selectedResult
    ? getModelDisplayName(selectedResult)
    : undefined;
  const modelResults = useMemo(
    () =>
      selectedModel === undefined
        ? []
        : results.filter(
            (result) => getModelDisplayName(result) === selectedModel,
          ),
    [results, selectedModel],
  );
  const entries = useMemo(() => {
    if (isCaseBrowser)
      return filtered.map((testcase) => ({
        id: testcase.name,
        name: testcase.name,
        testcase,
        result: undefined as EvaluationResult | undefined,
        href: `${casePath}/${encodeURIComponent(testcase.name)}`,
      }));
    const names = new Set(filtered.map((testcase) => testcase.name));
    const showMissing = !Object.values(filters).some(Boolean);
    return modelResults
      .filter(
        (result) =>
          names.has(result.input.testcase) ||
          (showMissing && !casesByName.has(result.input.testcase)),
      )
      .map((result) => ({
        id: result.id,
        name: result.input.testcase,
        testcase: casesByName.get(result.input.testcase),
        result,
        href: `${evaluationPath}/${encodeURIComponent(result.id)}`,
      }));
  }, [
    isCaseBrowser,
    filtered,
    filters,
    casePath,
    modelResults,
    casesByName,
    evaluationPath,
  ]);
  const totalEntries = isCaseBrowser
    ? activeTestcases.length
    : modelResults.length;
  const selectedId = isCaseBrowser ? (parts[1] ?? entries[0]?.id) : resultId;
  const selectedIndex = entries.findIndex((entry) => entry.id === selectedId);
  const selected = casesByName.get(
    isCaseBrowser ? (selectedId ?? '') : (selectedResult?.input.testcase ?? ''),
  );
  const loadingEvaluation =
    isEvaluations &&
    (evaluationId
      ? evaluationData?.evaluationId !== evaluationId
      : evaluations === null) &&
    !evaluationError;

  const go = useCallback((path: string, replace = false) => {
    window.history[replace ? 'replaceState' : 'pushState'](null, '', path);
    setPathname(window.location.pathname);
  }, []);

  useEffect(() => {
    if (pathname === '/') go('/testcases', true);
  }, [pathname, go]);

  useEffect(() => {
    setFilters(emptyFilters);
  }, [scope]);

  useEffect(() => {
    function followHistory() {
      setPathname(window.location.pathname);
    }
    function followLink(event: MouseEvent) {
      const link =
        event.target instanceof Element ? event.target.closest('a') : null;
      if (
        !link ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        link.target ||
        link.hasAttribute('download')
      )
        return;
      const url = new URL(link.href);
      if (
        url.origin !== window.location.origin ||
        !/^\/(testcases|candidates|evaluations)(\/|$)/.test(url.pathname)
      )
        return;
      event.preventDefault();
      go(url.pathname);
    }
    window.addEventListener('popstate', followHistory);
    document.addEventListener('click', followLink);
    return () => {
      window.removeEventListener('popstate', followHistory);
      document.removeEventListener('click', followLink);
    };
  }, [go]);

  useEffect(() => {
    if (
      ((isCaseBrowser && selected) || (resultId && selectedResult)) &&
      selectedIndex < 0
    )
      setFilters(emptyFilters);
  }, [isCaseBrowser, selected, resultId, selectedResult, selectedIndex]);

  useEffect(() => {
    const controller = new AbortController();
    setLoadError('');
    void (async () => {
      try {
        const [data, config] = (await Promise.all(
          ['/api/testcases', '/api/config'].map(async (url) => {
            const response = await fetch(url, {
              cache: 'no-store',
              signal: controller.signal,
            });
            if (!response.ok)
              throw new Error(
                `Failed to load ${url === '/api/testcases' ? 'testcases' : 'model configuration'} (HTTP ${response.status})`,
              );
            return response.json();
          }),
        )) as [{ testcases: TestcaseView[] }, ViewerConfig];
        if (controller.signal.aborted) return;
        setTestcases(data.testcases);
        setConfig(config);
        setLoadStatus('ready');
      } catch (error) {
        if (controller.signal.aborted) return;
        setLoadError(
          error instanceof Error ? error.message : 'Failed to load viewer data',
        );
        setLoadStatus('error');
      }
    })();
    return () => controller.abort();
  }, [loadRevision]);

  useEffect(() => {
    if (!isCandidates) return;
    const controller = new AbortController();
    setCandidateLoadError('');
    void (async () => {
      try {
        const response = await fetch('/api/candidates', {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok)
          throw new Error(
            `Failed to load candidates (HTTP ${response.status})`,
          );
        const data: { testcases: TestcaseView[]; batches: CandidateBatch[] } =
          await response.json();
        if (controller.signal.aborted) return;
        setCandidates(data.testcases);
        setCandidateBatches(data.batches.sort((a, b) => a.number - b.number));
        setCandidateLoadStatus('ready');
      } catch (error) {
        if (controller.signal.aborted) return;
        setCandidateLoadError(
          error instanceof Error ? error.message : 'Failed to load candidates',
        );
        setCandidateLoadStatus('error');
      }
    })();
    return () => controller.abort();
  }, [isCandidates, loadRevision]);

  useEffect(() => {
    if (!isEvaluations) return;
    const controller = new AbortController();
    setEvaluationError('');
    void (async () => {
      try {
        const response = await fetch(
          evaluationId
            ? `/api/evaluations/${encodeURIComponent(evaluationId)}`
            : '/api/evaluations',
          {
            cache: 'no-store',
            signal: controller.signal,
          },
        );
        if (!response.ok)
          throw new Error(
            response.status === 404
              ? `Evaluation ${evaluationId} not found`
              : `Failed to load evaluation results (HTTP ${response.status})`,
          );
        if (evaluationId) {
          const data: { results: EvaluationResult[] } = await response.json();
          if (controller.signal.aborted) return;
          const results = data.results.sort(
            (left, right) =>
              compareNames(left.input.testcase, right.input.testcase) ||
              compareNames(
                getModelDisplayName(left),
                getModelDisplayName(right),
              ) ||
              compareNames(left.id, right.id),
          );
          setEvaluationData({ evaluationId, results });
        } else {
          const data: { evaluations: string[] } = await response.json();
          if (controller.signal.aborted) return;
          setEvaluations(data.evaluations);
        }
      } catch (error) {
        if (!controller.signal.aborted)
          setEvaluationError(
            error instanceof Error
              ? error.message
              : 'Failed to load evaluation results',
          );
      }
    })();
    return () => controller.abort();
  }, [isEvaluations, evaluationId, loadRevision]);

  const previousPath = entries[selectedIndex - 1]?.href;
  const nextPath =
    selectedIndex >= 0 ? entries[selectedIndex + 1]?.href : undefined;
  useEffect(() => {
    if (!isCaseBrowser && !resultId) return;
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        (target instanceof Element &&
          target.closest(
            'input, textarea, select, [contenteditable], [role="combobox"], [role="listbox"], [role="option"]',
          )) ||
        (target instanceof Element &&
          target.id === 'image-viewport' &&
          target.getAttribute('data-zoom') === 'actual')
      )
        return;
      const path =
        event.key === 'ArrowLeft'
          ? previousPath
          : event.key === 'ArrowRight'
            ? nextPath
            : undefined;
      if (path) {
        event.preventDefault();
        go(path);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isCaseBrowser, resultId, previousPath, nextPath, go]);

  useEffect(() => {
    document.title = `${selectedResult ? `${selectedResult.input.testcase} · ${selectedModel} · ${evaluationId}` : isCaseBrowser ? (selected?.name ?? (isCandidates ? 'Candidates' : 'Testcases')) : evaluationId ? `Evaluation ${evaluationId}` : 'Evaluations'} · Midscene Grounding Benchmark`;
  }, [
    selected,
    selectedResult,
    selectedModel,
    isCaseBrowser,
    isCandidates,
    evaluationId,
  ]);

  useEffect(() => {
    if (selectedId)
      caseLinks.current.get(selectedId)?.scrollIntoView({ block: 'nearest' });
  }, [selectedId, activeLoadStatus, loadingEvaluation]);

  function updateFilters(values: Filters) {
    setFilters(values);
    const matches = filterTestcases(activeTestcases, values);
    if (isCaseBrowser && !matches.some((item) => item.name === selectedId)) {
      go(
        matches[0]
          ? `${casePath}/${encodeURIComponent(matches[0].name)}`
          : casePath,
        true,
      );
    } else if (
      resultId &&
      !matches.some((item) => item.name === selectedResult?.input.testcase)
    ) {
      const names = new Set(matches.map((testcase) => testcase.name));
      const next = modelResults.find((result) =>
        names.has(result.input.testcase),
      );
      go(
        next
          ? `${evaluationPath}/${encodeURIComponent(next.id)}`
          : evaluationPath,
        true,
      );
    }
  }

  const error =
    (isCandidates ? candidateLoadError : loadError) ||
    (isEvaluations ? evaluationError : '');
  const emptyTitle =
    activeLoadStatus === 'loading' || loadingEvaluation
      ? 'Loading…'
      : error
        ? 'Failed to Load'
        : resultId
          ? 'Result Not Found'
          : isCaseBrowser && parts[1]
            ? isCandidates
              ? 'Candidate Not Found'
              : 'Testcase Not Found'
            : isCandidates
              ? 'No Matching Candidates'
              : 'No Matching Testcases';

  return (
    <>
      <header className="app-header">
        <div className="app-toolbar">
          <div className="brand">
            <img
              className="brand-logo"
              src="https://midscenejs.com/favicon.png"
              alt=""
              width="33"
              height="33"
            />
            <span>Midscene Grounding Benchmark</span>
          </div>
        </div>
        <nav className="page-navigation" aria-label="Main navigation">
          <a href="/testcases" aria-current={isTestcases ? 'page' : undefined}>
            Testcases
          </a>
          <a
            href="/evaluations"
            aria-current={isEvaluations ? 'page' : undefined}
          >
            Evaluations
          </a>
        </nav>
        {(isCaseBrowser || resultId) && (
          <FilterBar
            testcases={activeTestcases}
            filters={filters}
            onChange={updateFilters}
            onClear={() => updateFilters(emptyFilters)}
            batch={
              isCandidates && candidateBatch
                ? {
                    value: String(candidateBatch.number),
                    options: candidateBatches.map((batch) => ({
                      value: String(batch.number),
                      text: `Batch ${batch.number} (${batch.candidates.length})`,
                    })),
                    onChange: (value) => {
                      const batch = candidateBatches.find(
                        (item) => String(item.number) === value,
                      );
                      const first = batch?.candidates.find((name) =>
                        candidates.some((candidate) => candidate.name === name),
                      );
                      setFilters(emptyFilters);
                      go(
                        first
                          ? `/candidates/${encodeURIComponent(first)}`
                          : '/candidates',
                      );
                    },
                  }
                : undefined
            }
          />
        )}
      </header>
      {error && (
        <div className="app-error" role="alert">
          <span>{error}</span>
          <button
            type="button"
            className="button"
            onClick={() => setLoadRevision((value) => value + 1)}
          >
            Retry
          </button>
        </div>
      )}
      {isEvaluations && !resultId ? (
        <main className="overview-page" key={evaluationId || 'evaluations'}>
          {evaluationId && (
            <a className="overview-back" href="/evaluations">
              ← All evaluations
            </a>
          )}
          <header className="overview-heading">
            <div>
              <h1>
                {evaluationId ? `Evaluation ${evaluationId}` : 'Evaluations'}
              </h1>
              {evaluationId ? (
                evaluationData?.evaluationId === evaluationId && (
                  <p>
                    <time
                      dateTime={new Date(Number(evaluationId)).toISOString()}
                    >
                      {new Date(Number(evaluationId)).toLocaleString('en-US', {
                        dateStyle: 'medium',
                        timeStyle: 'medium',
                      })}
                    </time>
                  </p>
                )
              ) : (
                <p>
                  Newest evaluations first. Select an evaluation to view its
                  results.
                </p>
              )}
            </div>
          </header>
          {loadingEvaluation || (evaluationId && loadStatus === 'loading') ? (
            <p className="list-empty">Loading…</p>
          ) : evaluationId ? (
            evaluationData?.evaluationId === evaluationId &&
            config && (
              <EvaluationReport
                key={evaluationId}
                evaluationId={evaluationId}
                results={results}
                testcases={testcases}
                config={config}
              />
            )
          ) : evaluations?.length ? (
            <ol className="evaluation-list">
              {evaluations.map((id) => (
                <li key={id}>
                  <a
                    className="evaluation-link"
                    href={`/evaluations/${encodeURIComponent(id)}`}
                  >
                    <span className="evaluation-identity">
                      <strong>Evaluation {id}</strong>
                      <time dateTime={new Date(Number(id)).toISOString()}>
                        {new Date(Number(id)).toLocaleString('en-US', {
                          dateStyle: 'medium',
                          timeStyle: 'medium',
                        })}
                      </time>
                    </span>
                    <span className="evaluation-link-action">
                      View evaluation →
                    </span>
                  </a>
                </li>
              ))}
            </ol>
          ) : evaluationError ? null : (
            <p className="list-empty">No evaluations yet.</p>
          )}
        </main>
      ) : isCaseBrowser || resultId ? (
        <div className="app-shell">
          <aside
            className="sidebar"
            aria-label={
              isCaseBrowser
                ? isCandidates
                  ? 'Candidates'
                  : 'Testcases'
                : `${selectedModel ?? 'Model'} results`
            }
          >
            {!isCaseBrowser && (
              <div className="sidebar-heading">
                <h1>
                  <a href={evaluationPath}>
                    {selectedModel ?? 'This Evaluation'}
                  </a>
                </h1>
              </div>
            )}
            <nav
              className="case-navigation"
              aria-label={
                isCaseBrowser
                  ? isCandidates
                    ? 'Candidates'
                    : 'Testcases'
                  : 'Results'
              }
            >
              <ol id="case-list" className="case-list">
                {entries.map((entry) => (
                  <li key={entry.id}>
                    <a
                      ref={(element) => {
                        if (element) caseLinks.current.set(entry.id, element);
                        else caseLinks.current.delete(entry.id);
                      }}
                      className="case-button"
                      href={entry.href}
                      aria-current={entry.id === selectedId ? 'true' : 'false'}
                    >
                      <span className="case-button-name">{entry.name}</span>
                      <span className="case-button-meta">
                        <span>
                          <span
                            className={`platform-dot ${entry.result?.input.platform ?? entry.testcase?.platform}`}
                            aria-hidden="true"
                          />
                          {(entry.result?.input.platform ??
                            entry.testcase?.platform) === 'web'
                            ? 'Web'
                            : 'Mobile'}
                        </span>
                        <span>{entry.testcase?.category.item}</span>
                        {entry.result ? (
                          <>
                            <span>{getModelDisplayName(entry.result)}</span>
                            <ResultStatus result={entry.result} />
                          </>
                        ) : (
                          entry.testcase?.groundTruth === 'REFUSAL' && (
                            <span>Refusal</span>
                          )
                        )}
                      </span>
                    </a>
                  </li>
                ))}
              </ol>
              {!entries.length && (
                <p className="list-empty">
                  {loadingEvaluation || activeLoadStatus === 'loading'
                    ? 'Loading…'
                    : isCaseBrowser
                      ? isCandidates
                        ? 'No matching candidates'
                        : 'No matching testcases'
                      : 'No matching results'}
                </p>
              )}
            </nav>
            <div className="sidebar-footer">
              <span>← / → Previous / next</span>
              <output
                id="result-count"
                className="result-count"
                aria-live="polite"
              >
                {activeLoadStatus === 'loading' || loadingEvaluation
                  ? 'Loading…'
                  : `${entries.length} / ${totalEntries} ${isCaseBrowser ? (isCandidates ? 'candidate' : 'testcase') : 'result'}${totalEntries === 1 ? '' : 's'}`}
              </output>
            </div>
          </aside>
          <main id="main" className="main">
            {activeLoadStatus === 'ready' &&
            (isCaseBrowser ? selected : selectedResult) ? (
              <div id="case-detail" className="case-detail">
                <header className="case-heading">
                  <div className="case-heading-text">
                    <div className="case-eyebrow">
                      {selectedResult ? (
                        <>
                          <a href={evaluationPath}>Evaluation {evaluationId}</a>
                          <span className="eyebrow-dot">/</span>
                          <span>{selectedModel}</span>
                        </>
                      ) : (
                        <>
                          <span>
                            {selected?.platform === 'web' ? 'Web' : 'Mobile'}
                          </span>
                          <span className="eyebrow-dot">/</span>
                          <span>{selected?.category.item}</span>
                        </>
                      )}
                    </div>
                    <h2 id="case-name">
                      {selectedResult?.input.testcase ?? selected?.name}
                    </h2>
                    {selectedResult && (
                      <a
                        className="testcase-link"
                        href={`/testcases/${encodeURIComponent(selectedResult.input.testcase)}`}
                      >
                        View testcase ↗
                      </a>
                    )}
                  </div>
                  <div
                    className="case-pagination"
                    aria-label="Testcase navigation"
                  >
                    <span id="case-position" className="case-position">
                      {selectedIndex + 1} / {entries.length}
                    </span>
                    <button
                      id="previous-case"
                      className="icon-button"
                      type="button"
                      aria-label="Previous"
                      title="Previous (←)"
                      disabled={!previousPath}
                      onClick={() => previousPath && go(previousPath)}
                    >
                      ←
                    </button>
                    <button
                      id="next-case"
                      className="icon-button"
                      type="button"
                      aria-label="Next"
                      title="Next (→)"
                      disabled={!nextPath}
                      onClick={() => nextPath && go(nextPath)}
                    >
                      →
                    </button>
                  </div>
                </header>
                {selected ? (
                  <div className="case-workspace">
                    <ScreenshotPanel
                      key={`${scope}:${selected.name}:${selected.imageUrl}`}
                      testcase={selected}
                      zoom={zoom}
                      onZoomChange={setZoom}
                      showGT={showGT}
                      onShowGTChange={setShowGT}
                      result={selectedResult}
                      showPrediction={showPrediction}
                      onShowPredictionChange={setShowPrediction}
                    />
                    <DetailsPanel testcase={selected}>
                      {selectedResult && (
                        <ResultPanel
                          evaluationId={evaluationId}
                          result={selectedResult}
                        />
                      )}
                    </DetailsPanel>
                  </div>
                ) : (
                  <div className="missing-testcase">
                    <p>
                      This testcase is missing from the dataset. Its screenshot
                      is unavailable.
                    </p>
                    {selectedResult && (
                      <ResultPanel
                        evaluationId={evaluationId}
                        result={selectedResult}
                      />
                    )}
                  </div>
                )}
              </div>
            ) : (
              <section
                id="empty-state"
                className="empty-state"
                aria-live="polite"
              >
                <span className="empty-symbol" aria-hidden="true">
                  ⌖
                </span>
                <h2>{emptyTitle}</h2>
                <p>Select an item from the sidebar or adjust the filters.</p>
              </section>
            )}
          </main>
        </div>
      ) : (
        <main className="empty-state">
          <h2>Page Not Found</h2>
          <p>
            <a href="/testcases">Browse testcases</a> ·{' '}
            <a href="/evaluations">View evaluations</a>
          </p>
        </main>
      )}
    </>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Viewer root element is missing');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
