import './index.less';
import { MoonOutlined, SunOutlined } from '@ant-design/icons';
import type { TestRunReportDump } from '@midscene/core';
import {
  Logo,
  globalThemeConfig,
  useGlobalPreference,
} from '@midscene/visualizer';
import { App as AntdApp, ConfigProvider, theme } from 'antd';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PlaywrightTasks } from '../../types';
import {
  type RunnerRoute,
  runnerHashForRoute,
} from '../../utils/test-run-report';
import { CaseWorkspace } from './case-workspace';
import {
  type RunnerCaseView,
  buildRunnerVisualIndex,
  flattenRunnerCases,
  getDefaultExpandedProjectKeys,
  getRunnerHealth,
  groupRunnerProjects,
} from './model';
import {
  type RunnerNavigationState,
  isSingleCaseReport,
  resolveRunnerNavigation,
} from './navigation';
import { RunOverview } from './run-overview';
import type { RunnerCaseDisplayMode } from './view-primitives';

interface TestRunnerReportProps {
  dump: TestRunReportDump;
  reports: PlaywrightTasks[];
  renderAgentReport(reports: PlaywrightTasks[]): ReactNode;
}

export default function TestRunnerReport({
  dump,
  reports,
  renderAgentReport,
}: TestRunnerReportProps): JSX.Element {
  const { darkModeEnabled: isDarkMode, setDarkModeEnabled: setIsDarkMode } =
    useGlobalPreference();
  const cases = useMemo(() => flattenRunnerCases(dump), [dump]);
  const health = useMemo(() => getRunnerHealth(cases), [cases]);
  const projects = useMemo(
    () => groupRunnerProjects(dump, cases),
    [cases, dump],
  );
  const visualIndex = useMemo(() => buildRunnerVisualIndex(reports), [reports]);
  const [caseDisplayMode, setCaseDisplayMode] =
    useState<RunnerCaseDisplayMode>('compact');
  const [expandedProjectKeys, setExpandedProjectKeys] = useState<Set<string>>(
    () =>
      getDefaultExpandedProjectKeys(
        projects.map((item) => ({ item, cases: item.cases })),
      ),
  );
  const [navigation, setNavigation] = useState<RunnerNavigationState>(() =>
    resolveRunnerNavigation(window.location.hash, cases, projects),
  );
  const mainRef = useRef<HTMLElement>(null);
  const overviewReturnStateRef = useRef<{
    scrollTop: number;
    caseKey?: string;
  }>({ scrollTop: 0 });
  const { page, selectedCaseKey, deepLinkedStepId } = navigation;
  const selectedCase = cases.find((item) => item.key === selectedCaseKey);
  const tracePage =
    page === 'case' &&
    new URLSearchParams(window.location.hash.slice(1)).get('runner-trace') ===
      'page';

  useEffect(() => {
    document.documentElement.setAttribute(
      'data-theme',
      isDarkMode ? 'dark' : 'light',
    );
  }, [isDarkMode]);

  useEffect(() => {
    const syncNavigationFromUrl = () => {
      setNavigation(
        resolveRunnerNavigation(window.location.hash, cases, projects),
      );
      window.requestAnimationFrame(() => {
        if (mainRef.current) mainRef.current.scrollTop = 0;
      });
    };
    window.addEventListener('popstate', syncNavigationFromUrl);
    window.addEventListener('hashchange', syncNavigationFromUrl);
    return () => {
      window.removeEventListener('popstate', syncNavigationFromUrl);
      window.removeEventListener('hashchange', syncNavigationFromUrl);
    };
  }, [cases, projects]);

  const restoreView = ({
    scrollTop = 0,
    focusCaseKey,
  }: {
    scrollTop?: number;
    focusCaseKey?: string;
  } = {}) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const main = mainRef.current;
        if (!main) return;
        main.scrollTop = scrollTop;
        const caseRow = focusCaseKey
          ? Array.from(
              main.querySelectorAll<HTMLElement>('[data-case-key]'),
            ).find((row) => row.dataset.caseKey === focusCaseKey)
          : undefined;
        const focusTarget = caseRow?.querySelector(
          '.runner-project-tree-case',
        ) as HTMLElement | null | undefined;
        (focusTarget ?? main).focus({ preventScroll: true });
      });
    });
  };
  const navigate = (
    route: RunnerRoute,
    viewState: { scrollTop?: number; focusCaseKey?: string } = {},
  ) => {
    const nextHash = runnerHashForRoute(route, window.location.hash);
    if (nextHash !== (window.location.hash || '#')) {
      window.history.pushState({ midsceneRunnerRoute: true }, '', nextHash);
    }
    setNavigation(resolveRunnerNavigation(nextHash, cases, projects));
    restoreView(viewState);
  };
  const openCase = (item: RunnerCaseView, stepId?: string) => {
    overviewReturnStateRef.current = {
      scrollTop: mainRef.current?.scrollTop ?? 0,
      caseKey: item.key,
    };
    navigate({
      page: 'case',
      caseKey: item.key,
      projectId: item.project.projectId,
      stepId,
    });
  };
  const backFromCase = () => {
    navigate(
      { page: 'overview' },
      {
        scrollTop: overviewReturnStateRef.current.scrollTop,
        focusCaseKey: overviewReturnStateRef.current.caseKey,
      },
    );
  };
  const closeTracePage = () => {
    if (!selectedCase) return;
    navigate({
      page: 'case',
      caseKey: selectedCase.key,
      projectId: selectedCase.project.projectId,
      stepId: deepLinkedStepId,
    });
  };

  return (
    <ConfigProvider
      theme={{
        ...globalThemeConfig(),
        algorithm: isDarkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
      }}
    >
      <AntdApp component={false}>
        <div
          className="test-runner-report"
          data-theme={isDarkMode ? 'dark' : 'light'}
        >
          <header className="runner-header">
            <div className="runner-header-title">
              <Logo />
              <div>
                <strong>Test Report</strong>
              </div>
            </div>
            <div className="runner-header-actions">
              <button
                type="button"
                className="runner-theme-toggle"
                onClick={() => setIsDarkMode(!isDarkMode)}
                aria-label="Toggle theme"
              >
                {isDarkMode ? <SunOutlined /> : <MoonOutlined />}
              </button>
            </div>
          </header>
          <main
            ref={mainRef}
            className="runner-main"
            tabIndex={-1}
            aria-label="Test report content"
          >
            {page === 'case' && selectedCase ? (
              <CaseWorkspace
                key={selectedCase.key}
                backLabel="Overview"
                item={selectedCase}
                standaloneRun={isSingleCaseReport(projects) ? dump : undefined}
                visualIndex={visualIndex}
                reports={reports}
                initialStepId={deepLinkedStepId}
                tracePage={tracePage}
                renderAgentReport={renderAgentReport}
                onBack={backFromCase}
                onCloseTracePage={closeTracePage}
              />
            ) : (
              <RunOverview
                visualIndex={visualIndex}
                dump={dump}
                cases={cases}
                health={health}
                projects={projects}
                caseDisplayMode={caseDisplayMode}
                onCaseDisplayModeChange={setCaseDisplayMode}
                expandedProjectKeys={expandedProjectKeys}
                onExpandedProjectKeysChange={setExpandedProjectKeys}
                onOpenCase={openCase}
              />
            )}
          </main>
        </div>
      </AntdApp>
    </ConfigProvider>
  );
}
