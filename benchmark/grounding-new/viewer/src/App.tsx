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
  const runId = isRuns ? (parts[1] ?? '') : '';
  const resultId = isRuns ? parts[2] : undefined;
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
        names.has(result.testcase) ||
        (!casesByName.has(result.testcase) &&
          !Object.values(filters).some(Boolean)),
    );
  }, [results, filtered, casesByName, filters]);
  const entries = isBenchmark
    ? filtered.map((testcase) => ({
        id: testcase.name,
        name: testcase.name,
        testcase,
        result: undefined as EvaluationResult | undefined,
        href: `/benchmark/${encodeURIComponent(testcase.name)}`,
      }))
    : filteredResults.map((result) => ({
        id: result.id,
        name: result.testcase,
        testcase: casesByName.get(result.testcase),
        result,
        href: `${runPath}/${encodeURIComponent(result.id)}`,
      }));
  const selectedId = isBenchmark ? (parts[1] ?? entries[0]?.id) : resultId;
  const selectedIndex = entries.findIndex((entry) => entry.id === selectedId);
  const selectedResult = resultId
    ? results.find((result) => result.id === resultId)
    : undefined;
  const selected = casesByName.get(
    isBenchmark ? (selectedId ?? '') : (selectedResult?.testcase ?? ''),
  );
  const loadingRun =
    isRuns && (runId ? runData?.runId !== runId : runs === null) && !runError;

  const go = useCallback((path: string, replace = false) => {
    window.history[replace ? 'replaceState' : 'pushState'](null, '', path);
    setPathname(window.location.pathname);
  }, []);

  useEffect(() => {
    if (pathname === '/') go('/benchmark', true);
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
                compareNames(left.testcase, right.testcase) ||
                compareNames(left.model, right.model) ||
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
    document.title = `${selectedResult ? `${selectedResult.testcase} · ${selectedResult.model} · ${runId}` : isBenchmark ? (selected?.name ?? 'Benchmark') : runId || '评测结果'} · Grounding`;
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
      !matches.some((item) => item.name === selectedResult?.testcase)
    ) {
      go(runPath, true);
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
        {(isBenchmark || runId) && (
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
              {runId && (
                <a className="back-link" href="/runs">
                  ← 所有运行
                </a>
              )}
              <h1>{runId ? `运行 ${runId}` : '评测结果'}</h1>
              <p>
                {runId
                  ? `${new Date(Number(runId)).toLocaleString()} · ${filteredResults.length} / ${results.length} 条结果`
                  : '按运行时间排列，选择一次运行查看结果。'}
              </p>
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
          ) : runError ? null : runId ? (
            filteredResults.length ? (
              <div className="results-table-wrap">
                <table className="results-table">
                  <thead>
                    <tr>
                      <th>Testcase</th>
                      <th>Model</th>
                      <th>Platform</th>
                      <th>结果</th>
                      <th>耗时</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredResults.map((result) => (
                      <tr key={result.id}>
                        <td>
                          <a
                            href={`${runPath}/${encodeURIComponent(result.id)}`}
                          >
                            {result.testcase}
                          </a>
                        </td>
                        <td>{result.model}</td>
                        <td>{result.platform === 'web' ? 'Web' : 'Mobile'}</td>
                        <td>
                          <ResultStatus result={result} />
                        </td>
                        <td>{(result.durationMs / 1000).toFixed(2)} s</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="list-empty">
                {results.length ? '没有符合筛选条件的结果' : '本次运行暂无结果'}
              </p>
            )
          ) : runs?.length ? (
            <ol className="run-list">
              {runs.map((id) => (
                <li key={id}>
                  <a
                    className="run-card"
                    href={`/runs/${encodeURIComponent(id)}`}
                  >
                    <span>
                      <strong>{id}</strong>
                      <time dateTime={new Date(Number(id)).toISOString()}>
                        {new Date(Number(id)).toLocaleString()}
                      </time>
                    </span>
                    <span>查看结果 →</span>
                  </a>
                </li>
              ))}
            </ol>
          ) : (
            <p className="list-empty">暂无评测运行</p>
          )}
        </main>
      ) : isBenchmark || resultId ? (
        <div className="app-shell">
          <aside
            className="sidebar"
            aria-label={isBenchmark ? '用例列表' : '本次运行结果'}
          >
            <div className="sidebar-heading">
              <h1>
                {isBenchmark ? '测试用例' : <a href={runPath}>本次运行</a>}
              </h1>
              <output
                id="result-count"
                className="result-count"
                aria-live="polite"
              >
                {loadStatus === 'loading' || loadingRun
                  ? '正在加载…'
                  : `${entries.length} / ${isBenchmark ? testcases.length : results.length} ${isBenchmark ? '个用例' : '条结果'}`}
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
                            className={`platform-dot ${entry.result?.platform ?? entry.testcase?.platform}`}
                            aria-hidden="true"
                          />
                          {(entry.result?.platform ??
                            entry.testcase?.platform) === 'web'
                            ? 'Web'
                            : 'Mobile'}
                        </span>
                        <span>{entry.testcase?.category.item}</span>
                        {entry.result ? (
                          <>
                            <span>{entry.result.model}</span>
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
                          <a href={runPath}>运行 {runId}</a>
                          <span className="eyebrow-dot">/</span>
                          <span>{selectedResult.model}</span>
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
                      {selectedResult?.testcase ?? selected?.name}
                    </h2>
                    {selectedResult && (
                      <a
                        className="benchmark-link"
                        href={`/benchmark/${encodeURIComponent(selectedResult.testcase)}`}
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
