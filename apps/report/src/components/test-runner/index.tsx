import './index.less';
import type { TestRunReportDump } from '@midscene/core';
import {
  Logo,
  globalThemeConfig,
  useGlobalPreference,
} from '@midscene/visualizer';
import { Alert, App as AntdApp, ConfigProvider, theme } from 'antd';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import ThemeDarkIcon from '../../icons/theme-dark.svg?react';
import ThemeLightIcon from '../../icons/theme-light.svg?react';
import type { PlaywrightTasks } from '../../types';
import {
  type RunnerRoute,
  runnerHashForRoute,
} from '../../utils/test-run-report';
import { CaseWorkspace } from './case-workspace';
import {
  type RunnerCaseView,
  buildRunnerStepIndex,
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
import { getSelectTheme } from './select';
import type { RunnerCaseDisplayMode } from './view-primitives';

const reportTheme = globalThemeConfig();

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
  const stepIndex = useMemo(
    () => buildRunnerStepIndex(dump, cases),
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
    resolveRunnerNavigation(window.location.hash, cases, projects, stepIndex),
  );
  const mainRef = useRef<HTMLElement>(null);
  const overviewReturnStateRef = useRef<{
    scrollTop: number;
    caseKey?: string;
  }>({ scrollTop: 0 });
  const { page, selectedCaseKey, deepLinkedStepId, unmatchedStepSelector } =
    navigation;
  const selectedCase = cases.find((item) => item.key === selectedCaseKey);
  const midsceneVersion = useMemo(() => {
    for (const report of reports) {
      const version = report.get().sdkVersion.trim();
      if (version) return version.startsWith('v') ? version : `v${version}`;
    }
    return undefined;
  }, [reports]);

  useEffect(() => {
    document.documentElement.setAttribute(
      'data-theme',
      isDarkMode ? 'dark' : 'light',
    );
  }, [isDarkMode]);

  useEffect(() => {
    const syncNavigationFromUrl = () => {
      setNavigation(
        resolveRunnerNavigation(
          window.location.hash,
          cases,
          projects,
          stepIndex,
        ),
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
  }, [cases, projects, stepIndex]);

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
    setNavigation(
      resolveRunnerNavigation(nextHash, cases, projects, stepIndex),
    );
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
  return (
    <ConfigProvider
      theme={{
        ...reportTheme,
        algorithm: isDarkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
        components: {
          ...reportTheme.components,
          Select: {
            ...reportTheme.components?.Select,
            ...getSelectTheme(isDarkMode),
          },
        },
      }}
    >
      <AntdApp component={false}>
        <div
          className="test-runner-report"
          data-theme={isDarkMode ? 'dark' : 'light'}
        >
          <header className="runner-header">
            <div className="runner-header-inner">
              <div className="runner-header-title">
                <Logo />
                <div>
                  <strong>Test Report</strong>
                </div>
              </div>
              <div className="runner-header-actions">
                {midsceneVersion ? (
                  <span className="runner-header-version">
                    Midscene {midsceneVersion}
                  </span>
                ) : null}
                <div className="runner-header-theme-control">
                  <button
                    type="button"
                    className="runner-theme-toggle"
                    onClick={() => setIsDarkMode(!isDarkMode)}
                    aria-label="Toggle theme"
                  >
                    {isDarkMode ? <ThemeDarkIcon /> : <ThemeLightIcon />}
                  </button>
                </div>
              </div>
            </div>
          </header>
          <main
            ref={mainRef}
            className="runner-main"
            tabIndex={-1}
            aria-label="Test report content"
          >
            {unmatchedStepSelector ? (
              <Alert
                className="runner-step-selector-alert"
                type="info"
                showIcon
                message={`No Step matches runner-step=${unmatchedStepSelector}.`}
              />
            ) : null}
            {page === 'case' && selectedCase ? (
              <CaseWorkspace
                key={selectedCase.key}
                backLabel="Overview"
                item={selectedCase}
                standaloneRun={isSingleCaseReport(projects) ? dump : undefined}
                visualIndex={visualIndex}
                reports={reports}
                initialStepId={deepLinkedStepId}
                renderAgentReport={renderAgentReport}
                onBack={backFromCase}
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
