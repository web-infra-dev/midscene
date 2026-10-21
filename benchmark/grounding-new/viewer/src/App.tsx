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
import { ScreenshotPanel } from './components/ScreenshotPanel';
import type { Filters, TestcaseView } from './types';
import './styles.css';

const emptyFilters: Filters = {
  search: '',
  platform: '',
  category: '',
  dataset: '',
  outcome: '',
};

function compareNames(left: TestcaseView, right: TestcaseView) {
  return left.name < right.name ? -1 : left.name > right.name ? 1 : 0;
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

function hashName() {
  try {
    return decodeURIComponent(window.location.hash.slice(1));
  } catch {
    return null;
  }
}

function writeHash(name: string, replace = false) {
  const hash = `#${encodeURIComponent(name)}`;
  if (window.location.hash !== hash)
    window.history[replace ? 'replaceState' : 'pushState'](null, '', hash);
}

function App() {
  const [testcases, setTestcases] = useState<TestcaseView[]>([]);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const filtersRef = useRef(filters);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [missingHash, setMissingHash] = useState(false);
  const [zoom, setZoom] = useState<'fit' | 'actual'>('fit');
  const [showGT, setShowGT] = useState(true);
  const [loadStatus, setLoadStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [loadError, setLoadError] = useState('');
  const [loadRevision, setLoadRevision] = useState(0);
  const caseButtons = useRef(new Map<string, HTMLButtonElement>());
  const filtered = useMemo(
    () => filterTestcases(testcases, filters),
    [testcases, filters],
  );
  const selectedIndex = filtered.findIndex(
    (item) => item.name === selectedName,
  );
  const selected = selectedIndex >= 0 ? filtered[selectedIndex] : null;

  const changeFiltersState = useCallback((values: Filters) => {
    filtersRef.current = values;
    setFilters(values);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoadStatus('loading');
    setLoadError('');
    async function load() {
      try {
        const response = await fetch('/api/testcases', {
          method: 'GET',
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok)
          throw new Error(`题库读取失败（HTTP ${response.status}）`);
        const data: { testcases?: TestcaseView[] } = await response.json();
        if (!Array.isArray(data.testcases))
          throw new Error('服务返回了无效的题库数据');
        if (controller.signal.aborted) return;
        const items = [...data.testcases].sort(compareNames);
        setTestcases(items);
        setLoadStatus('ready');
        const requested = hashName();
        const requestedExists = items.some((item) => item.name === requested);
        if (requested === null || (requested && !requestedExists)) {
          setMissingHash(true);
          setSelectedName(null);
          return;
        }
        let matches = filterTestcases(items, filtersRef.current);
        if (requested && !matches.some((item) => item.name === requested)) {
          changeFiltersState(emptyFilters);
          matches = items;
        }
        const name = requested || matches[0]?.name || null;
        setMissingHash(false);
        setSelectedName(name);
        if (name) writeHash(name, true);
      } catch (error) {
        if (controller.signal.aborted) return;
        setLoadError(error instanceof Error ? error.message : '题库加载失败');
        setLoadStatus('error');
        setSelectedName(null);
      }
    }
    void load();
    return () => controller.abort();
  }, [loadRevision, changeFiltersState]);

  const selectCase = useCallback(
    (name: string, replace = false) => {
      if (!filtered.some((item) => item.name === name)) return;
      setMissingHash(false);
      setSelectedName(name);
      writeHash(name, replace);
    },
    [filtered],
  );

  const navigate = useCallback(
    (direction: number) => {
      const item = filtered[selectedIndex + direction];
      if (selectedIndex >= 0 && item) selectCase(item.name);
    },
    [filtered, selectedIndex, selectCase],
  );

  useEffect(() => {
    function followHash() {
      if (loadStatus !== 'ready' || !testcases.length) return;
      const requested = hashName();
      if (requested === '') {
        const first = filtered[0];
        if (first) selectCase(first.name, true);
        return;
      }
      if (!requested || !testcases.some((item) => item.name === requested)) {
        setMissingHash(true);
        setSelectedName(null);
        return;
      }
      if (!filtered.some((item) => item.name === requested))
        changeFiltersState(emptyFilters);
      setMissingHash(false);
      setSelectedName(requested);
      writeHash(requested, true);
    }
    window.addEventListener('hashchange', followHash);
    return () => window.removeEventListener('hashchange', followHash);
  }, [loadStatus, testcases, filtered, selectCase, changeFiltersState]);

  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
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
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        navigate(event.key === 'ArrowLeft' ? -1 : 1);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [navigate]);

  useEffect(() => {
    document.title =
      loadStatus === 'ready' && selected
        ? `${selected.name} · Grounding`
        : 'Grounding · 测试用例查看器';
  }, [loadStatus, selected]);

  useEffect(() => {
    if (selectedName)
      caseButtons.current
        .get(selectedName)
        ?.scrollIntoView({ block: 'nearest' });
  }, [selectedName]);

  function updateFilters(values: Filters) {
    changeFiltersState(values);
    setMissingHash(false);
    const matches = filterTestcases(testcases, values);
    if (!matches.some((item) => item.name === selectedName)) {
      const name = matches[0]?.name ?? null;
      setSelectedName(name);
      if (name) writeHash(name, true);
    }
  }

  const empty =
    loadStatus === 'loading'
      ? { title: '正在加载测试用例', description: '读取用例、原始截图与标注。' }
      : loadStatus === 'error'
        ? {
            title: '无法加载测试用例',
            description: '请确认查看器服务正常运行，然后重新加载。',
          }
        : missingHash
          ? {
              title: '未找到链接对应的用例',
              description: '请从左侧列表选择用例，或检查链接中的用例名称。',
            }
          : testcases.length === 0
            ? {
                title: '题库中没有测试用例',
                description: '请检查 testcases 目录后重新加载。',
              }
            : {
                title: '没有符合条件的用例',
                description: '调整筛选条件或清空筛选后继续浏览。',
              };

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
          <span>
            Grounding <span className="brand-secondary">测试用例查看器</span>
          </span>
        </div>
        <FilterBar
          testcases={testcases}
          filters={filters}
          onChange={updateFilters}
          onClear={() => updateFilters(emptyFilters)}
        />
      </header>
      {loadStatus === 'error' && (
        <div id="app-error" className="app-error" role="alert">
          <span id="app-error-message">{loadError}</span>
          <button
            id="retry-load"
            type="button"
            className="button"
            onClick={() => setLoadRevision((value) => value + 1)}
          >
            重新加载
          </button>
        </div>
      )}
      <div className="app-shell">
        <aside className="sidebar" aria-label="用例列表">
          <div className="sidebar-heading">
            <h1>测试用例</h1>
            <output
              id="result-count"
              className="result-count"
              aria-live="polite"
            >
              {loadStatus === 'loading'
                ? '正在加载…'
                : loadStatus === 'error'
                  ? '加载失败'
                  : `${filtered.length} / ${testcases.length} 个用例`}
            </output>
          </div>
          <nav className="case-navigation" aria-label="测试用例列表">
            <ol id="case-list" className="case-list">
              {filtered.map((testcase) => (
                <li key={testcase.name}>
                  <button
                    ref={(element) => {
                      if (element)
                        caseButtons.current.set(testcase.name, element);
                      else caseButtons.current.delete(testcase.name);
                    }}
                    type="button"
                    className="case-button"
                    data-name={testcase.name}
                    aria-current={
                      testcase.name === selectedName ? 'true' : 'false'
                    }
                    aria-label={testcase.name}
                    onClick={() => selectCase(testcase.name)}
                  >
                    <span className="case-button-name">{testcase.name}</span>
                    <span className="case-button-meta">
                      <span>
                        <span
                          className={`platform-dot ${testcase.platform}`}
                          aria-hidden="true"
                        />
                        {testcase.platform === 'web' ? 'Web' : 'Mobile'}
                      </span>
                      <span>{testcase.category.item}</span>
                      {testcase.groundTruth === 'REFUSAL' && (
                        <span>REFUSAL</span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
            {loadStatus === 'ready' && !filtered.length && (
              <p id="list-empty" className="list-empty">
                没有符合筛选条件的用例
              </p>
            )}
          </nav>
          <div className="sidebar-footer">← / → 切换上一题、下一题</div>
        </aside>
        <main id="main" className="main">
          {loadStatus === 'ready' && selected ? (
            <div id="case-detail" className="case-detail">
              <header className="case-heading">
                <div className="case-heading-text">
                  <div className="case-eyebrow">
                    <span id="case-platform">
                      {selected.platform === 'web' ? 'Web' : 'Mobile'}
                    </span>
                    <span className="eyebrow-dot">/</span>
                    <span id="case-category">{selected.category.item}</span>
                  </div>
                  <h2 id="case-name">{selected.name}</h2>
                </div>
                <div className="case-pagination" aria-label="用例切换">
                  <span id="case-position" className="case-position">
                    {selectedIndex + 1} / {filtered.length}
                  </span>
                  <button
                    id="previous-case"
                    className="icon-button"
                    type="button"
                    aria-label="上一题"
                    title="上一题（←）"
                    disabled={selectedIndex <= 0}
                    onClick={() => navigate(-1)}
                  >
                    ←
                  </button>
                  <button
                    id="next-case"
                    className="icon-button"
                    type="button"
                    aria-label="下一题"
                    title="下一题（→）"
                    disabled={selectedIndex >= filtered.length - 1}
                    onClick={() => navigate(1)}
                  >
                    →
                  </button>
                </div>
              </header>
              <div className="case-workspace">
                <ScreenshotPanel
                  key={selected.name}
                  testcase={selected}
                  zoom={zoom}
                  onZoomChange={setZoom}
                  showGT={showGT}
                  onShowGTChange={setShowGT}
                />
                <DetailsPanel testcase={selected} />
              </div>
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
              <h2 id="empty-title">{empty.title}</h2>
              <p id="empty-description">{empty.description}</p>
            </section>
          )}
        </main>
      </div>
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
