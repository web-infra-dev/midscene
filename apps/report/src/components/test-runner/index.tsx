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
  type RunnerProjectView,
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
import { ProjectWorkspace } from './project-workspace';
import { RunOverview } from './run-overview';
import type { RunnerCaseDisplayMode } from './view-primitives';

type RunnerCaseParent = 'overview' | 'project';

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
  const {
    page,
    selectedProjectId,
    selectedCaseKey,
    caseParent,
    deepLinkedStepId,
  } = navigation;
  const selectedProject = projects.find(
    (item) => item.project.projectId === selectedProjectId,
  );
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
          '.runner-case-title-button, .runner-project-tree-case',
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
  const openProject = (item: RunnerProjectView) => {
    navigate({ page: 'project', projectId: item.project.projectId });
  };
  const openCase = (
    item: RunnerCaseView,
    parent: RunnerCaseParent = 'overview',
    stepId?: string,
  ) => {
    if (parent === 'overview') {
      overviewReturnStateRef.current = {
        scrollTop: mainRef.current?.scrollTop ?? 0,
        caseKey: item.key,
      };
    }
    navigate({
      page: 'case',
      caseKey: item.key,
      projectId: item.project.projectId,
      parent,
      stepId,
    });
  };
  const backFromCase = () => {
    if (caseParent === 'overview') {
      navigate(
        { page: 'overview' },
        {
          scrollTop: overviewReturnStateRef.current.scrollTop,
          focusCaseKey: overviewReturnStateRef.current.caseKey,
        },
      );
    } else {
      navigate(
        selectedProject
          ? {
              page: 'project',
              projectId: selectedProject.project.projectId,
            }
          : { page: 'overview' },
      );
    }
  };
  const closeTracePage = () => {
    if (!selectedCase) return;
    navigate({
      page: 'case',
      caseKey: selectedCase.key,
      projectId: selectedCase.project.projectId,
      parent: caseParent,
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
                <strong>Midscene Test Report</strong>
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
            aria-label="Midscene Test report content"
          >
            {page === 'overview' ? (
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
                onOpenCase={(item, stepId) =>
                  openCase(item, 'overview', stepId)
                }
                onOpenProject={openProject}
              />
            ) : page === 'project' && selectedProject ? (
              <ProjectWorkspace
                key={selectedProject.key}
                item={selectedProject}
                visualIndex={visualIndex}
                onBack={() => navigate({ page: 'overview' })}
                onOpenCase={(item, stepId) => openCase(item, 'project', stepId)}
              />
            ) : page === 'case' && selectedCase ? (
              <CaseWorkspace
                key={selectedCase.key}
                backLabel={
                  caseParent === 'overview'
                    ? 'Overview'
                    : selectedProject?.project.name || 'Project'
                }
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
                onOpenCase={(item, stepId) =>
                  openCase(item, 'overview', stepId)
                }
                onOpenProject={openProject}
              />
            )}
          </main>
        </div>
      </AntdApp>
    </ConfigProvider>
  );
}
