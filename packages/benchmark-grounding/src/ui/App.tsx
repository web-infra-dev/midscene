import { sortBy } from 'es-toolkit';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import type { UIData } from '../core/reporter';
import { Performance } from './Performance';
import { brandLogo } from './brand';
import { DetailsPanel } from './components/DetailsPanel';
import { Filters as FilterBar } from './components/Filters';
import { ResultPanel, ResultStatus } from './components/ResultPanel';
import { ScreenshotPanel } from './components/ScreenshotPanel';
import {
  type Filters,
  emptyFilters,
  filterTestcases,
  resultKey,
  testcasePath,
} from './types';

export function App({ data }: { data: UIData }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const filters = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return {
      search,
      platform: params.get('platform') ?? '',
      category: params.get('category') ?? '',
      dataset: params.get('dataset') ?? '',
      outcome: params.get('outcome') ?? '',
    };
  }, [location.search, search]);
  const [zoom, setZoom] = useState<'fit' | 'actual'>('fit');
  const [showGT, setShowGT] = useState(true);
  const [showPrediction, setShowPrediction] = useState(true);
  const caseNavigation = useRef<HTMLElement>(null);
  const isReport = data.mode === 'report';
  const isOverview = isReport && location.pathname === '/overview';
  const title =
    isReport && data.run
      ? `Midscene Grounding Benchmark - Evaluation ${data.run.id}`
      : 'Midscene Grounding Benchmark';
  const parts = location.pathname.split('/').filter(Boolean);
  const requestedCase = (() => {
    try {
      return parts[1] ? decodeURIComponent(parts[1]) : undefined;
    } catch {
      return undefined;
    }
  })();
  const testcases = useMemo(
    () => sortBy(data.testcases, ['name']),
    [data.testcases],
  );
  const filtered = useMemo(
    () => filterTestcases(testcases, filters),
    [testcases, filters],
  );
  const models = useMemo(
    () => (data.run?.models.map((model) => model.displayName) ?? []).sort(),
    [data],
  );
  const requestedModel = new URLSearchParams(location.search).get('model');
  const selectedModel =
    requestedModel && models.includes(requestedModel)
      ? requestedModel
      : models[0];
  const unknownCase =
    requestedCase !== undefined &&
    !testcases.some((testcase) => testcase.name === requestedCase);
  const selectedIndex =
    !unknownCase && filtered.length
      ? Math.max(
          0,
          filtered.findIndex((testcase) => testcase.name === requestedCase),
        )
      : -1;
  const selected = filtered[selectedIndex];
  const selectedName = selected?.name;
  const byCaseAndModel = useMemo(
    () =>
      new Map(
        data.results?.map((result) => [
          resultKey(result.input.testcase, result.input.displayName),
          result,
        ]),
      ),
    [data.results],
  );
  const selectedResult =
    selected && selectedModel
      ? byCaseAndModel.get(resultKey(selected.name, selectedModel))
      : undefined;
  const previous = filtered[selectedIndex - 1];
  const next = selectedIndex >= 0 ? filtered[selectedIndex + 1] : undefined;

  useEffect(() => {
    document.title = isOverview
      ? title
      : `${selected?.name ?? 'Testcases'} · ${isReport ? 'Report' : 'Viewer'} · ${title}`;
  }, [isOverview, selected, isReport, title]);
  useEffect(() => {
    caseNavigation.current
      ?.querySelector('[aria-current="true"]')
      ?.scrollIntoView({ block: 'nearest' });
    document
      .querySelector('.case-model-option[aria-current="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [selectedName, selectedModel, isOverview]);
  useEffect(() => {
    if (isOverview || !selected) return;
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        (target instanceof Element &&
          target.closest(
            'input, textarea, select, [contenteditable], [role="combobox"], [role="listbox"], [role="option"]',
          )) ||
        (target instanceof Element &&
          target.closest('#image-viewport[data-zoom="actual"]'))
      )
        return;
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        const testcase = event.key === 'ArrowUp' ? previous : next;
        if (testcase)
          navigate(testcasePath(testcase.name, selectedModel, location.search));
      } else if (
        isReport &&
        selectedModel &&
        (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
      ) {
        event.preventDefault();
        const model =
          models[
            models.indexOf(selectedModel) + (event.key === 'ArrowLeft' ? -1 : 1)
          ];
        if (model)
          navigate(testcasePath(selected.name, model, location.search));
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [
    isOverview,
    isReport,
    selected,
    previous,
    next,
    selectedModel,
    models,
    location.search,
    navigate,
  ]);

  function updateFilters(values: Filters) {
    setSearch(values.search);
    const params = new URLSearchParams(location.search);
    for (const [key, value] of Object.entries(values)) {
      if (key === 'search') continue;
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const matches = filterTestcases(testcases, values);
    navigate(
      testcasePath(
        matches.some((testcase) => testcase.name === selectedName)
          ? selectedName
          : matches[0]?.name,
        selectedModel,
        params.toString(),
      ),
      { replace: true },
    );
  }

  if (location.pathname === '/' || (parts[0] !== 'testcases' && !isOverview))
    return (
      <Navigate
        to={`${isReport ? '/overview' : '/testcases'}${location.search}`}
        replace
      />
    );

  return (
    <>
      <header className="app-header">
        <div className="app-toolbar">
          <div className="brand">
            <img
              className="brand-logo"
              src={brandLogo}
              alt=""
              width="33"
              height="33"
            />
            <h1>{title}</h1>
          </div>
        </div>
        {isReport && (
          <nav className="page-navigation" aria-label="Main navigation">
            <Link
              to={{ pathname: '/overview', search: location.search }}
              aria-current={isOverview ? 'page' : undefined}
            >
              Overview
            </Link>
            <Link
              to={testcasePath(selected?.name, selectedModel, location.search)}
              aria-current={!isOverview ? 'page' : undefined}
            >
              Testcases
            </Link>
          </nav>
        )}
        {!isOverview && (
          <FilterBar
            testcases={testcases}
            filters={filters}
            onChange={updateFilters}
            onClear={() => updateFilters(emptyFilters)}
          />
        )}
      </header>
      {isReport && data.incomplete && (
        <output className="app-error incomplete-run">
          <strong>Incomplete run</strong>
          <span>
            {data.missingResults ?? data.summaries?.missing ?? 0} missing
            results. Missing results are excluded from scores.
          </span>
        </output>
      )}
      {isOverview ? (
        <main className="overview-page">
          <Performance data={data} onOpenTestcase={() => setSearch('')} />
        </main>
      ) : (
        <div className="app-shell">
          <aside className="sidebar" aria-label="Testcases">
            <nav
              ref={caseNavigation}
              className="case-navigation"
              aria-label="Testcases"
            >
              <ol id="case-list" className="case-list">
                {filtered.map((testcase) => {
                  const result = selectedModel
                    ? byCaseAndModel.get(
                        resultKey(testcase.name, selectedModel),
                      )
                    : undefined;
                  return (
                    <li key={testcase.name}>
                      <Link
                        className="case-button"
                        to={testcasePath(
                          testcase.name,
                          selectedModel,
                          location.search,
                        )}
                        aria-current={
                          testcase.name === selectedName ? 'true' : 'false'
                        }
                      >
                        <span className="case-button-name">
                          {testcase.name}
                        </span>
                        <span className="case-button-meta">
                          <span>
                            <span
                              className={`platform-dot ${testcase.platform}`}
                              aria-hidden="true"
                            />
                            {testcase.platform === 'web' ? 'Web' : 'Mobile'}
                          </span>
                          <span>{testcase.category.item}</span>
                          {isReport ? (
                            <ResultStatus result={result} />
                          ) : (
                            testcase.groundTruth === 'REFUSAL' && (
                              <span>Refusal</span>
                            )
                          )}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ol>
              {!filtered.length && (
                <p className="list-empty">No matching testcases</p>
              )}
            </nav>
            <div className="sidebar-footer">
              <span>↑ / ↓ Testcases{isReport && ' · ← / → Models'}</span>
              <output
                id="result-count"
                className="result-count"
                aria-live="polite"
              >
                {filtered.length} / {testcases.length} testcases
              </output>
            </div>
          </aside>
          <main id="main" className="main">
            {selected ? (
              <div id="case-detail" className="case-detail">
                <header className="case-heading">
                  <div className="case-heading-text">
                    <div className="case-eyebrow">
                      <span>
                        {selected.platform === 'web' ? 'Web' : 'Mobile'}
                      </span>
                      <span className="eyebrow-dot">/</span>
                      <span>{selected.category.item}</span>
                      {isReport && selectedModel && (
                        <>
                          <span className="eyebrow-dot">/</span>
                          <span>{selectedModel}</span>
                        </>
                      )}
                    </div>
                    <h2 id="case-name">{selected.name}</h2>
                  </div>
                  <div
                    className="case-pagination"
                    aria-label="Testcase navigation"
                  >
                    <span id="case-position" className="case-position">
                      {selectedIndex + 1} / {filtered.length}
                    </span>
                    <button
                      id="previous-case"
                      className="icon-button"
                      type="button"
                      aria-label="Previous"
                      aria-keyshortcuts="ArrowUp"
                      title="Previous testcase (↑)"
                      disabled={!previous}
                      onClick={() =>
                        previous &&
                        navigate(
                          testcasePath(
                            previous.name,
                            selectedModel,
                            location.search,
                          ),
                        )
                      }
                    >
                      ↑
                    </button>
                    <button
                      id="next-case"
                      className="icon-button"
                      type="button"
                      aria-label="Next"
                      aria-keyshortcuts="ArrowDown"
                      title="Next testcase (↓)"
                      disabled={!next}
                      onClick={() =>
                        next &&
                        navigate(
                          testcasePath(
                            next.name,
                            selectedModel,
                            location.search,
                          ),
                        )
                      }
                    >
                      ↓
                    </button>
                  </div>
                </header>
                {isReport && (
                  <section
                    className="case-model-switcher"
                    aria-label="Model results"
                  >
                    <span className="case-model-label">Model</span>
                    <div className="case-model-options">
                      {models.map((model) => (
                        <Link
                          key={model}
                          to={testcasePath(
                            selected.name,
                            model,
                            location.search,
                          )}
                          className="case-model-option"
                          aria-current={
                            selectedModel === model ? 'true' : 'false'
                          }
                        >
                          <span>{model}</span>
                          <ResultStatus
                            result={byCaseAndModel.get(
                              resultKey(selected.name, model),
                            )}
                          />
                        </Link>
                      ))}
                    </div>
                  </section>
                )}
                <div className="case-workspace">
                  <ScreenshotPanel
                    key={selected.name}
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
                    {isReport && (
                      <ResultPanel
                        model={selectedModel}
                        result={selectedResult}
                      />
                    )}
                  </DetailsPanel>
                </div>
              </div>
            ) : (
              <section className="empty-state">
                <div className="empty-symbol" aria-hidden="true">
                  ⌕
                </div>
                <h2>
                  {unknownCase ? 'Testcase not found' : 'No matching testcases'}
                </h2>
                <p>
                  {unknownCase
                    ? 'Select a testcase from the list.'
                    : 'Try changing or clearing the filters.'}
                </p>
                {Object.values(filters).some(Boolean) && (
                  <button
                    className="button"
                    type="button"
                    onClick={() => updateFilters(emptyFilters)}
                  >
                    Clear filters
                  </button>
                )}
              </section>
            )}
          </main>
        </div>
      )}
    </>
  );
}
