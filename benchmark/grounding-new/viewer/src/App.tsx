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

function ModelCards({
  runId,
  results,
}: {
  runId: string;
  results: EvaluationResult[];
}) {
  const runPath = `/runs/${encodeURIComponent(runId)}`;
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
          const tokens = modelResults.flatMap((result) =>
            result.profiling.totalTokens !== undefined &&
            result.profiling.totalTokens > 0
              ? [result.profiling.totalTokens]
              : [],
          );
          const durations = modelResults
            .map((result) => result.profiling.durationMs)
            .filter((duration) => duration > 0);
          return {
            model,
            count: modelResults.length,
            passed: modelResults.filter((result) => result.output.correct)
              .length,
            geometricMeanTokens: tokens.length
              ? Math.exp(
                  tokens.reduce((total, value) => total + Math.log(value), 0) /
                    tokens.length,
                )
              : null,
            arithmeticMeanTokens: tokens.length
              ? tokens.reduce((total, value) => total + value, 0) /
                tokens.length
              : null,
            tokenCount: tokens.length,
            geometricMeanMs: durations.length
              ? Math.exp(
                  durations.reduce(
                    (total, value) => total + Math.log(value),
                    0,
                  ) / durations.length,
                )
              : null,
            arithmeticMeanMs: durations.length
              ? durations.reduce((total, value) => total + value, 0) /
                durations.length
              : null,
            durationCount: durations.length,
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
          count,
          passed,
          geometricMeanTokens,
          arithmeticMeanTokens,
          tokenCount,
          geometricMeanMs,
          arithmeticMeanMs,
          durationCount,
          first,
        }) => (
          <a
            key={model}
            className="model-card"
            href={`${runPath}/${encodeURIComponent(first.id)}`}
          >
            <div className="model-card-heading">
              <strong>{model}</strong>
              <span>查看结果 →</span>
            </div>
            <div className="model-card-metrics">
              <div>
                <span>通过率</span>
                <strong>{((passed / count) * 100).toFixed(1)}%</strong>
                <small>
                  {passed} / {count} 通过
                </small>
              </div>
              <div>
                <span>Token 消耗（几何平均）</span>
                <strong>
                  {geometricMeanTokens === null
                    ? '—'
                    : geometricMeanTokens.toLocaleString(undefined, {
                        maximumFractionDigits: 0,
                      })}
                </strong>
                <span>Token 消耗（算术平均）</span>
                <strong>
                  {arithmeticMeanTokens === null
                    ? '—'
                    : arithmeticMeanTokens.toLocaleString(undefined, {
                        maximumFractionDigits: 0,
                      })}
                </strong>
                <small title="仅统计大于 0 的 Token 消耗，零值和缺失值不参与计算">
                  {tokenCount} / {count} 条有效记录
                </small>
              </div>
              <div>
                <span>耗时（几何平均）</span>
                <strong>
                  {geometricMeanMs === null
                    ? '—'
                    : `${(geometricMeanMs / 1000).toFixed(2)} s`}
                </strong>
                <span>耗时（算术平均）</span>
                <strong>
                  {arithmeticMeanMs === null
                    ? '—'
                    : `${(arithmeticMeanMs / 1000).toFixed(2)} s`}
                </strong>
                <small title="仅统计大于 0 的耗时，零值和缺失值不参与计算">
                  {durationCount} / {count} 条有效记录
                </small>
              </div>
            </div>
          </a>
        ),
      )}
    </div>
  ) : (
    <p className="list-empty">本次运行暂无结果</p>
  );
}

function RunGroup({
  runId,
  revision,
}: {
  runId: string;
  revision: number;
}) {
  const [expanded, setExpanded] = useState(true);
  const [results, setResults] = useState<EvaluationResult[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/runs/${encodeURIComponent(runId)}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok)
          throw new Error(`运行 ${runId} 读取失败（HTTP ${response.status}）`);
        const data: { results: EvaluationResult[] } = await response.json();
        if (controller.signal.aborted) return;
        setResults(data.results);
        setError('');
      } catch (error) {
        if (!controller.signal.aborted)
          setError(error instanceof Error ? error.message : '评测结果读取失败');
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [runId, revision]);

  return (
    <section className="run-group">
      <h2 className="run-group-heading">
        <button
          type="button"
          className="run-toggle"
          aria-expanded={expanded}
          aria-controls={`run-${runId}-models`}
          onClick={() => setExpanded((value) => !value)}
        >
          <span className="run-chevron" aria-hidden="true">
            ›
          </span>
          <span className="run-identity">
            <strong>{runId}</strong>
            <time dateTime={new Date(Number(runId)).toISOString()}>
              {new Date(Number(runId)).toLocaleString()}
            </time>
          </span>
          <span className="run-summary-meta">
            {results
              ? `${new Set(results.map((result) => result.input.model)).size} 个模型 · ${results.length} 条结果`
              : error
                ? '加载失败'
                : '正在加载…'}
          </span>
        </button>
      </h2>
      <div
        id={`run-${runId}-models`}
        className="run-group-content"
        hidden={!expanded}
      >
        {error && (
          <p className="run-load-error" role="alert">
            {error}
          </p>
        )}
        {results ? (
          <ModelCards runId={runId} results={results} />
        ) : !error ? (
          <p className="list-empty">正在加载…</p>
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
  const [runs, setRuns] = useState<string[] | null>(null);
  const [runData, setRunData] = useState<{
    runId: string;
    results: EvaluationResult[];
  } | null>(null);
  const [runError, setRunError] = useState('');
  const [runRevision, setRunRevision] = useState(0);
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
  const isBenchmark = parts[0] === 'benchmark' && parts.length <= 2;
  const isRuns = parts[0] === 'runs' && parts.length <= 3;
  const runId = isRuns && parts.length === 3 ? (parts[1] ?? '') : '';
  const resultId = isRuns && parts.length === 3 ? parts[2] : undefined;
  const scope = isBenchmark ? 'benchmark' : runId;
  const runPath = `/runs/${encodeURIComponent(runId)}`;
  const results = useMemo(
    () => (runData?.runId === runId ? runData.results : []),
    [runData, runId],
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
  const entries = isBenchmark
    ? filtered.map((testcase) => ({
        id: testcase.name,
        name: testcase.name,
        testcase,
        result: undefined as EvaluationResult | undefined,
        href: `/benchmark/${encodeURIComponent(testcase.name)}`,
      }))
    : filteredResults
        .filter((result) => result.input.model === selectedResult?.input.model)
        .map((result) => ({
          id: result.id,
          name: result.input.testcase,
          testcase: casesByName.get(result.input.testcase),
          result,
          href: `${runPath}/${encodeURIComponent(result.id)}`,
        }));
  const selectedId = isBenchmark ? (parts[1] ?? entries[0]?.id) : resultId;
  const selectedIndex = entries.findIndex((entry) => entry.id === selectedId);
  const selected = casesByName.get(
    isBenchmark ? (selectedId ?? '') : (selectedResult?.input.testcase ?? ''),
  );
  const loadingRun =
    isRuns && (runId ? runData?.runId !== runId : runs === null) && !runError;

  const go = useCallback((path: string, replace = false) => {
    window.history[replace ? 'replaceState' : 'pushState'](null, '', path);
    setPathname(window.location.pathname);
  }, []);

  useEffect(() => {
    if (pathname === '/') go('/benchmark', true);
    else if (isRuns && parts.length === 2) go('/runs', true);
  }, [pathname, isRuns, parts.length, go]);

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
        !/^\/(benchmark|runs)(\/|$)/.test(url.pathname)
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
      ((isBenchmark && selected) || (resultId && selectedResult)) &&
      selectedIndex < 0
    )
      setFilters(emptyFilters);
  }, [isBenchmark, selected, resultId, selectedResult, selectedIndex]);

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
          throw new Error(`题库读取失败（HTTP ${response.status}）`);
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
        setLoadError(error instanceof Error ? error.message : '题库加载失败');
        setLoadStatus('error');
      }
    }
    void load();
    return () => controller.abort();
  }, [loadRevision]);

  useEffect(() => {
    if (!isRuns) return;
    const controller = new AbortController();
    setRunError('');
    async function load() {
      try {
        const response = await fetch(
          runId ? `/api/runs/${encodeURIComponent(runId)}` : '/api/runs',
          {
            cache: 'no-store',
            signal: controller.signal,
          },
        );
        if (!response.ok)
          throw new Error(
            response.status === 404
              ? `未找到运行 ${runId}`
              : `评测结果读取失败（HTTP ${response.status}）`,
          );
        if (runId) {
          const data: { results: EvaluationResult[] } = await response.json();
          if (controller.signal.aborted) return;
          setRunData({
            runId,
            results: data.results.sort(
              (left, right) =>
                compareNames(left.input.testcase, right.input.testcase) ||
                compareNames(left.input.model, right.input.model) ||
                compareNames(left.id, right.id),
            ),
          });
        } else {
          const data: { runs: string[] } = await response.json();
          if (controller.signal.aborted) return;
          setRuns(data.runs);
        }
        setRunError('');
      } catch (error) {
        if (!controller.signal.aborted)
          setRunError(
            error instanceof Error ? error.message : '评测结果读取失败',
          );
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [isRuns, runId, runRevision]);

  const previousPath = entries[selectedIndex - 1]?.href;
  const nextPath =
    selectedIndex >= 0 ? entries[selectedIndex + 1]?.href : undefined;
  useEffect(() => {
    if (!isBenchmark && !resultId) return;
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
  }, [isBenchmark, resultId, previousPath, nextPath, go]);

  useEffect(() => {
    document.title = `${selectedResult ? `${selectedResult.input.testcase} · ${selectedResult.input.model} · ${runId}` : isBenchmark ? (selected?.name ?? 'Benchmark') : runId || '评测结果'} · Grounding`;
  }, [selected, selectedResult, isBenchmark, runId]);

  useEffect(() => {
    if (selectedId)
      caseLinks.current.get(selectedId)?.scrollIntoView({ block: 'nearest' });
  }, [selectedId, loadStatus, loadingRun]);

  function updateFilters(values: Filters) {
    setFilters(values);
    const matches = filterTestcases(testcases, values);
    if (isBenchmark && !matches.some((item) => item.name === selectedId)) {
      go(
        matches[0]
          ? `/benchmark/${encodeURIComponent(matches[0].name)}`
          : '/benchmark',
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
      go(next ? `${runPath}/${encodeURIComponent(next.id)}` : '/runs', true);
    }
  }

  const error = loadError || (isRuns ? runError : '');
  const emptyTitle =
    loadStatus === 'loading' || loadingRun
      ? '正在加载…'
      : error
        ? '加载失败'
        : resultId
          ? '未找到链接对应的结果'
          : isBenchmark && parts[1]
            ? '未找到链接对应的用例'
            : '没有符合条件的用例';

  return (
    <>
      <header className="app-header">
        <div className="brand">
          <img
            className="brand-logo"
            src="https://midscenejs.com/favicon.png"
            alt=""
            width="33"
            height="33"
          />
          <span>Grounding</span>
        </div>
        <nav className="page-navigation" aria-label="查看器导航">
          <a href="/benchmark" aria-current={isBenchmark ? 'page' : undefined}>
            Benchmark
          </a>
          <a href="/runs" aria-current={isRuns ? 'page' : undefined}>
            评测结果
          </a>
        </nav>
        {(isBenchmark || resultId) && (
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
            onClick={() => {
              setLoadRevision((value) => value + 1);
              setRunRevision((value) => value + 1);
            }}
          >
            重新加载
          </button>
        </div>
      )}
      {isRuns && !resultId ? (
        <main className="overview-page">
          <header className="overview-heading">
            <div>
              <h1>评测结果</h1>
              <p>按运行时间倒序展示，点击运行标题可展开或收拢统计卡片。</p>
            </div>
            <div className="overview-actions">
              <span>每 5 秒更新</span>
              <button
                type="button"
                className="button"
                onClick={() => setRunRevision((value) => value + 1)}
              >
                刷新结果
              </button>
            </div>
          </header>
          {loadingRun ? (
            <p className="list-empty">正在加载…</p>
          ) : runs?.length ? (
            <ol className="run-list">
              {runs.map((id) => (
                <li key={id}>
                  <RunGroup runId={id} revision={runRevision} />
                </li>
              ))}
            </ol>
          ) : runError ? null : (
            <p className="list-empty">暂无评测运行</p>
          )}
        </main>
      ) : isBenchmark || resultId ? (
        <div className="app-shell">
          <aside
            className="sidebar"
            aria-label={
              isBenchmark
                ? '用例列表'
                : `${selectedResult?.input.model ?? '模型'}评测结果`
            }
          >
            <div className="sidebar-heading">
              <h1>
                {isBenchmark ? (
                  '测试用例'
                ) : (
                  <a href="/runs">
                    {selectedResult?.input.model ?? '本次运行'}
                  </a>
                )}
              </h1>
              <output
                id="result-count"
                className="result-count"
                aria-live="polite"
              >
                {loadStatus === 'loading' || loadingRun
                  ? '正在加载…'
                  : `${entries.length} / ${isBenchmark ? testcases.length : modelResults.length} ${isBenchmark ? '个用例' : '条结果'}`}
              </output>
            </div>
            <nav
              className="case-navigation"
              aria-label={isBenchmark ? '测试用例列表' : '结果列表'}
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
                            <span>REFUSAL</span>
                          )
                        )}
                      </span>
                    </a>
                  </li>
                ))}
              </ol>
              {!entries.length && (
                <p className="list-empty">
                  {loadingRun || loadStatus === 'loading'
                    ? '正在加载…'
                    : '没有符合筛选条件的记录'}
                </p>
              )}
            </nav>
            <div className="sidebar-footer">← / → 切换上一条、下一条</div>
          </aside>
          <main id="main" className="main">
            {loadStatus === 'ready' &&
            (isBenchmark ? selected : selectedResult) ? (
              <div id="case-detail" className="case-detail">
                <header className="case-heading">
                  <div className="case-heading-text">
                    <div className="case-eyebrow">
                      {selectedResult ? (
                        <>
                          <a href="/runs">运行 {runId}</a>
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
                        className="benchmark-link"
                        href={`/benchmark/${encodeURIComponent(selectedResult.input.testcase)}`}
                      >
                        查看 Benchmark 用例 ↗
                      </a>
                    )}
                  </div>
                  <div className="case-pagination" aria-label="记录切换">
                    <span id="case-position" className="case-position">
                      {selectedIndex + 1} / {entries.length}
                    </span>
                    <button
                      id="previous-case"
                      className="icon-button"
                      type="button"
                      aria-label="上一条"
                      title="上一条（←）"
                      disabled={!previousPath}
                      onClick={() => previousPath && go(previousPath)}
                    >
                      ←
                    </button>
                    <button
                      id="next-case"
                      className="icon-button"
                      type="button"
                      aria-label="下一条"
                      title="下一条（→）"
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
                        <ResultPanel runId={runId} result={selectedResult} />
                      )}
                    </DetailsPanel>
                  </div>
                ) : (
                  <div className="missing-testcase">
                    <p>题库中未找到此用例，无法显示原始截图。</p>
                    {selectedResult && (
                      <ResultPanel runId={runId} result={selectedResult} />
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
                <p>请从左侧列表选择记录，或调整筛选条件。</p>
              </section>
            )}
          </main>
        </div>
      ) : (
        <main className="empty-state">
          <h2>页面不存在</h2>
          <p>
            <a href="/benchmark">查看 Benchmark</a> ·{' '}
            <a href="/runs">查看评测结果</a>
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
