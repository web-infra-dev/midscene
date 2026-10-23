import {
  StrictMode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createRoot } from 'react-dom/client';
import { DetailsPanel } from './components/DetailsPanel';
import { Filters as FilterBar } from './components/Filters';
import { ResultPanel, ResultStatus } from './components/ResultPanel';
import { ScreenshotPanel } from './components/ScreenshotPanel';
import { modelCosts } from './metadata/model-cost';
import type { EvaluationResult, Filters, TestcaseView } from './types';
import './styles.css';

const emptyFilters: Filters = {
  search: '',
  platform: '',
  category: '',
  dataset: '',
  outcome: '',
};

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
    const searchable =
      `${testcase.name}\n${testcase.instruction.en}\n${testcase.instruction.zh}`.toLowerCase();
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
      value !== undefined && Number.isFinite(value) && value > 0,
  );
  return {
    geometricMean: samples.length
      ? Math.exp(
          samples.reduce((total, value) => total + Math.log(value), 0) /
            samples.length,
        )
      : null,
    count: samples.length,
  };
}

function ModelCards({
  evaluationId,
  results,
}: {
  evaluationId: string;
  results: EvaluationResult[];
}) {
  const evaluationPath = `/evaluations/${encodeURIComponent(evaluationId)}`;
  const modelSummaries = useMemo(
    () =>
      [...new Set(results.map((result) => result.input.model))]
        .sort(compareNames)
        .map((model) => {
          const modelResults = results
            .filter((result) => result.input.model === model)
            .sort(
              (left, right) =>
                compareNames(left.input.testcase, right.input.testcase) ||
                compareNames(left.id, right.id),
            );
          const reference = Object.entries(modelCosts).find(
            ([name]) => name === model,
          )?.[1];
          const estimates = modelResults.flatMap(({ profiling }) => {
            const {
              totalPromptTokens: input,
              totalCompletionTokens: output,
              calls,
            } = profiling;
            if (
              !reference ||
              input === undefined ||
              !Number.isFinite(input) ||
              input <= 0 ||
              output === undefined ||
              !Number.isFinite(output) ||
              output < 0 ||
              calls === undefined ||
              !Number.isInteger(calls) ||
              calls <= 0 ||
              (profiling.byModel &&
                Object.keys(profiling.byModel).some((name) => name !== model))
            ) {
              return [];
            }
            const inputCost = input * reference.pricing.inputPerToken;
            const outputCost = output * reference.pricing.outputPerToken;
            return [
              {
                durationMs:
                  calls * reference.performance.timeToFirstTokenMs +
                  (1000 * Math.max(output - calls, 0)) /
                    reference.performance.outputTokensPerSecond,
                cost: inputCost + outputCost,
              },
            ];
          });
          return {
            model,
            reference,
            count: modelResults.length,
            passed: modelResults.filter((result) => result.output.correct)
              .length,
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
            duration: summarize(
              modelResults.map(({ profiling }) => profiling.durationMs),
            ),
            estimatedDuration: summarize(
              estimates.map(({ durationMs }) => durationMs),
            ),
            estimatedCost: summarize(estimates.map(({ cost }) => cost)),
            first: modelResults[0],
          };
        }),
    [results],
  );

  return modelSummaries.length ? (
    <div className="model-grid">
      {modelSummaries.map(
        ({
          model,
          reference,
          count,
          passed,
          totalTokens,
          inputTokens,
          outputTokens,
          duration,
          estimatedDuration,
          estimatedCost,
          first,
        }) => (
          <a
            key={model}
            className="model-card"
            href={`${evaluationPath}/${encodeURIComponent(first.id)}`}
          >
            <div className="model-card-heading">
              <strong>{model}</strong>
              <span>View details →</span>
            </div>
            <div className="model-card-pass-rate">
              <span>Pass rate</span>
              <strong>{((passed / count) * 100).toFixed(1)}%</strong>
              <small>
                {passed} / {count} passed
              </small>
            </div>
            <table className="model-card-metrics">
              <thead>
                <tr>
                  <th scope="col">Metric</th>
                  <th scope="col">Average</th>
                </tr>
              </thead>
              <tbody>
                {[
                  {
                    label: 'Total tokens',
                    values: totalTokens,
                    unit: 'tokens',
                    note: 'Geometric mean of total tokens per test case, not the sum of the input and output token averages. Only positive values are included.',
                  },
                  {
                    label: 'Input tokens',
                    values: inputTokens,
                    unit: 'tokens',
                    note: 'Geometric mean of input tokens per test case. Only positive values are included.',
                  },
                  {
                    label: 'Output tokens',
                    values: outputTokens,
                    unit: 'tokens',
                    note: 'Geometric mean of output tokens per test case. Only positive values are included.',
                  },
                  {
                    label: 'Estimated duration',
                    values: estimatedDuration,
                    unit: 'seconds',
                    note: 'Estimated from output tokens: calls × time to first token + max(output tokens − calls, 0) ÷ output throughput. Assumes sequential calls; excludes records with missing usage or model reference data.',
                  },
                  {
                    label: 'Estimated cost (USD)',
                    values: estimatedCost,
                    unit: 'USD',
                    note: 'Input tokens × input price + output tokens × output price, calculated per test case before taking the geometric mean. Excludes cache discounts and records with missing usage or pricing.',
                  },
                  {
                    label: 'Measured duration',
                    values: duration,
                    unit: 'seconds',
                    note: 'Geometric mean of end-to-end execution time. Only positive values are included.',
                  },
                ].map(({ label, values, unit, note }) => (
                  <tr key={label} title={note}>
                    <th scope="row">
                      {label}
                      <small>
                        {values.count} / {count} valid{' '}
                        {count === 1 ? 'result' : 'results'}
                      </small>
                    </th>
                    <td>
                      {values.geometricMean === null
                        ? '—'
                        : unit === 'seconds'
                          ? `${(values.geometricMean / 1000).toFixed(2)} s`
                          : unit === 'USD'
                            ? `$${values.geometricMean.toFixed(6)}`
                            : values.geometricMean.toLocaleString('en-US', {
                                maximumFractionDigits: 0,
                              })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="model-card-estimate-note">
              <p>
                Averages use the geometric mean of finite, positive values.
                Duration and cost estimates are calculated per test case before
                averaging.
              </p>
              {reference ? (
                <>
                  <p>
                    Performance: {reference.source} best P50 · TTFT{' '}
                    {(reference.performance.timeToFirstTokenMs / 1000).toFixed(
                      2,
                    )}{' '}
                    s · {reference.performance.outputTokensPerSecond} tokens/s (
                    {reference.observedAt.slice(0, 10)})
                  </p>
                  <p>
                    Pricing: OpenRouter listed rates · Input $
                    {reference.pricing.inputPerToken * 1_000_000} / Output $
                    {reference.pricing.outputPerToken * 1_000_000} per million
                    tokens
                  </p>
                  <p>
                    Best P50 values are selected independently and may come from
                    different providers. Costs exclude cache discounts and
                    long-context surcharges. Duration estimates use all output
                    tokens; reasoning time may overlap with time to first token.
                  </p>
                </>
              ) : (
                <p>No pricing or performance reference data for this model.</p>
              )}
            </div>
          </a>
        ),
      )}
    </div>
  ) : (
    <p className="list-empty">No results for this evaluation yet.</p>
  );
}

function EvaluationGroup({
  evaluationId,
  revision,
}: {
  evaluationId: string;
  revision: number;
}) {
  const [expanded, setExpanded] = useState(true);
  const [results, setResults] = useState<EvaluationResult[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(
          `/api/evaluations/${encodeURIComponent(evaluationId)}`,
          {
            cache: 'no-store',
            signal: controller.signal,
          },
        );
        if (!response.ok)
          throw new Error(
            `Failed to load evaluation ${evaluationId} (HTTP ${response.status})`,
          );
        const data: { results: EvaluationResult[] } = await response.json();
        if (controller.signal.aborted) return;
        setResults(data.results);
        setError('');
      } catch (error) {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error
              ? error.message
              : 'Failed to load evaluation results',
          );
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [evaluationId, revision]);

  const modelCount = new Set(results?.map((result) => result.input.model)).size;

  return (
    <section className="evaluation-group">
      <h2 className="evaluation-group-heading">
        <button
          type="button"
          className="evaluation-toggle"
          aria-expanded={expanded}
          aria-controls={`evaluation-${evaluationId}-models`}
          onClick={() => setExpanded((value) => !value)}
        >
          <span className="evaluation-chevron" aria-hidden="true">
            ›
          </span>
          <span className="evaluation-identity">
            <strong>Evaluation {evaluationId}</strong>
            <time dateTime={new Date(Number(evaluationId)).toISOString()}>
              {new Date(Number(evaluationId)).toLocaleString('en-US', {
                dateStyle: 'medium',
                timeStyle: 'medium',
              })}
            </time>
          </span>
          <span className="evaluation-summary-meta">
            {results
              ? `${modelCount} ${modelCount === 1 ? 'model' : 'models'} · ${results.length} ${results.length === 1 ? 'result' : 'results'}`
              : error
                ? 'Failed to load'
                : 'Loading…'}
          </span>
        </button>
      </h2>
      <div
        id={`evaluation-${evaluationId}-models`}
        className="evaluation-group-content"
        hidden={!expanded}
      >
        {error && (
          <p className="evaluation-load-error" role="alert">
            {error}
          </p>
        )}
        {results ? (
          <ModelCards evaluationId={evaluationId} results={results} />
        ) : !error ? (
          <p className="list-empty">Loading…</p>
        ) : null}
      </div>
    </section>
  );
}

function App() {
  const [pathname, setPathname] = useState(window.location.pathname);
  const [testcases, setTestcases] = useState<TestcaseView[]>([]);
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
  const isEvaluations = parts[0] === 'evaluations' && parts.length <= 3;
  const evaluationId =
    isEvaluations && parts.length === 3 ? (parts[1] ?? '') : '';
  const resultId = isEvaluations && parts.length === 3 ? parts[2] : undefined;
  const scope = isTestcases ? 'testcases' : evaluationId;
  const evaluationPath = `/evaluations/${encodeURIComponent(evaluationId)}`;
  const results = useMemo(
    () =>
      evaluationData?.evaluationId === evaluationId
        ? evaluationData.results
        : [],
    [evaluationData, evaluationId],
  );
  const casesByName = useMemo(
    () => new Map(testcases.map((testcase) => [testcase.name, testcase])),
    [testcases],
  );
  const filtered = useMemo(
    () => filterTestcases(testcases, filters),
    [testcases, filters],
  );
  const filteredResults = useMemo(() => {
    const names = new Set(filtered.map((testcase) => testcase.name));
    return results.filter(
      (result) =>
        names.has(result.input.testcase) ||
        (!casesByName.has(result.input.testcase) &&
          !Object.values(filters).some(Boolean)),
    );
  }, [results, filtered, casesByName, filters]);
  const selectedResult = resultId
    ? results.find((result) => result.id === resultId)
    : undefined;
  const modelResults = selectedResult
    ? results.filter(
        (result) => result.input.model === selectedResult.input.model,
      )
    : [];
  const entries = isTestcases
    ? filtered.map((testcase) => ({
        id: testcase.name,
        name: testcase.name,
        testcase,
        result: undefined as EvaluationResult | undefined,
        href: `/testcases/${encodeURIComponent(testcase.name)}`,
      }))
    : filteredResults
        .filter((result) => result.input.model === selectedResult?.input.model)
        .map((result) => ({
          id: result.id,
          name: result.input.testcase,
          testcase: casesByName.get(result.input.testcase),
          result,
          href: `${evaluationPath}/${encodeURIComponent(result.id)}`,
        }));
  const totalEntries = isTestcases ? testcases.length : modelResults.length;
  const selectedId = isTestcases ? (parts[1] ?? entries[0]?.id) : resultId;
  const selectedIndex = entries.findIndex((entry) => entry.id === selectedId);
  const selected = casesByName.get(
    isTestcases ? (selectedId ?? '') : (selectedResult?.input.testcase ?? ''),
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
    else if (isEvaluations && parts.length === 2) go('/evaluations', true);
  }, [pathname, isEvaluations, parts.length, go]);

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
        !/^\/(testcases|evaluations)(\/|$)/.test(url.pathname)
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
      ((isTestcases && selected) || (resultId && selectedResult)) &&
      selectedIndex < 0
    )
      setFilters(emptyFilters);
  }, [isTestcases, selected, resultId, selectedResult, selectedIndex]);

  useEffect(() => {
    const controller = new AbortController();
    setLoadStatus('loading');
    setLoadError('');
    async function load() {
      try {
        const response = await fetch('/api/testcases', {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok)
          throw new Error(
            `Failed to load test cases (HTTP ${response.status})`,
          );
        const data: { testcases: TestcaseView[] } = await response.json();
        if (controller.signal.aborted) return;
        setTestcases(
          data.testcases.sort((left, right) =>
            compareNames(left.name, right.name),
          ),
        );
        setLoadStatus('ready');
      } catch (error) {
        if (controller.signal.aborted) return;
        setLoadError(
          error instanceof Error ? error.message : 'Failed to load test cases',
        );
        setLoadStatus('error');
      }
    }
    void load();
    return () => controller.abort();
  }, [loadRevision]);

  useEffect(() => {
    if (!isEvaluations) return;
    const controller = new AbortController();
    setEvaluationError('');
    async function load() {
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
          setEvaluationData({
            evaluationId,
            results: data.results.sort(
              (left, right) =>
                compareNames(left.input.testcase, right.input.testcase) ||
                compareNames(left.input.model, right.input.model) ||
                compareNames(left.id, right.id),
            ),
          });
        } else {
          const data: { evaluations: string[] } = await response.json();
          if (controller.signal.aborted) return;
          setEvaluations(data.evaluations);
        }
        setEvaluationError('');
      } catch (error) {
        if (!controller.signal.aborted)
          setEvaluationError(
            error instanceof Error
              ? error.message
              : 'Failed to load evaluation results',
          );
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [isEvaluations, evaluationId, loadRevision]);

  const previousPath = entries[selectedIndex - 1]?.href;
  const nextPath =
    selectedIndex >= 0 ? entries[selectedIndex + 1]?.href : undefined;
  useEffect(() => {
    if (!isTestcases && !resultId) return;
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
  }, [isTestcases, resultId, previousPath, nextPath, go]);

  useEffect(() => {
    document.title = `${selectedResult ? `${selectedResult.input.testcase} · ${selectedResult.input.model} · ${evaluationId}` : isTestcases ? (selected?.name ?? 'Testcases') : evaluationId || 'Evaluations'} · Midscene Grounding Benchmark`;
  }, [selected, selectedResult, isTestcases, evaluationId]);

  useEffect(() => {
    if (selectedId)
      caseLinks.current.get(selectedId)?.scrollIntoView({ block: 'nearest' });
  }, [selectedId, loadStatus, loadingEvaluation]);

  function updateFilters(values: Filters) {
    setFilters(values);
    const matches = filterTestcases(testcases, values);
    if (isTestcases && !matches.some((item) => item.name === selectedId)) {
      go(
        matches[0]
          ? `/testcases/${encodeURIComponent(matches[0].name)}`
          : '/testcases',
        true,
      );
    } else if (
      resultId &&
      !matches.some((item) => item.name === selectedResult?.input.testcase)
    ) {
      const next = results.find(
        (result) =>
          result.input.model === selectedResult?.input.model &&
          matches.some((testcase) => testcase.name === result.input.testcase),
      );
      go(
        next
          ? `${evaluationPath}/${encodeURIComponent(next.id)}`
          : '/evaluations',
        true,
      );
    }
  }

  const error = loadError || (isEvaluations ? evaluationError : '');
  const emptyTitle =
    loadStatus === 'loading' || loadingEvaluation
      ? 'Loading…'
      : error
        ? 'Failed to load'
        : resultId
          ? 'Result not found'
          : isTestcases && parts[1]
            ? 'Test case not found'
            : 'No matching test cases';

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
        {(isTestcases || resultId) && (
          <FilterBar
            testcases={testcases}
            filters={filters}
            onChange={updateFilters}
            onClear={() => updateFilters(emptyFilters)}
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
        <main className="overview-page">
          <header className="overview-heading">
            <div>
              <h1>Evaluations</h1>
              <p>
                Newest evaluations first. Select an evaluation to expand or
                collapse its model summaries.
              </p>
            </div>
          </header>
          {loadingEvaluation ? (
            <p className="list-empty">Loading…</p>
          ) : evaluations?.length ? (
            <ol className="evaluation-list">
              {evaluations.map((id) => (
                <li key={id}>
                  <EvaluationGroup evaluationId={id} revision={loadRevision} />
                </li>
              ))}
            </ol>
          ) : evaluationError ? null : (
            <p className="list-empty">No evaluations yet.</p>
          )}
        </main>
      ) : isTestcases || resultId ? (
        <div className="app-shell">
          <aside
            className="sidebar"
            aria-label={
              isTestcases
                ? 'Test cases'
                : `${selectedResult?.input.model ?? 'Model'} results`
            }
          >
            {!isTestcases && (
              <div className="sidebar-heading">
                <h1>
                  <a href="/evaluations">
                    {selectedResult?.input.model ?? 'This evaluation'}
                  </a>
                </h1>
              </div>
            )}
            <nav
              className="case-navigation"
              aria-label={isTestcases ? 'Test cases' : 'Results'}
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
                            <span>{entry.result.input.model}</span>
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
                  {loadingEvaluation || loadStatus === 'loading'
                    ? 'Loading…'
                    : isTestcases
                      ? 'No matching test cases'
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
                {loadStatus === 'loading' || loadingEvaluation
                  ? 'Loading…'
                  : `${entries.length} / ${totalEntries} ${isTestcases ? 'test case' : 'result'}${totalEntries === 1 ? '' : 's'}`}
              </output>
            </div>
          </aside>
          <main id="main" className="main">
            {loadStatus === 'ready' &&
            (isTestcases ? selected : selectedResult) ? (
              <div id="case-detail" className="case-detail">
                <header className="case-heading">
                  <div className="case-heading-text">
                    <div className="case-eyebrow">
                      {selectedResult ? (
                        <>
                          <a href="/evaluations">Evaluation {evaluationId}</a>
                          <span className="eyebrow-dot">/</span>
                          <span>{selectedResult.input.model}</span>
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
                        View test case ↗
                      </a>
                    )}
                  </div>
                  <div
                    className="case-pagination"
                    aria-label="Test case navigation"
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
                      key={`${scope}:${selected.name}`}
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
                      This test case is missing from the dataset. Its screenshot
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
          <h2>Page not found</h2>
          <p>
            <a href="/testcases">Browse test cases</a> ·{' '}
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
