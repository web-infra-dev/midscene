import { Drawer } from 'antd';
import { type Ref, useRef, useState } from 'react';
import closeIcon from './assets/case-navigation-close.svg';
import menuIcon from './assets/case-navigation-menu.svg';
import {
  type RunnerCaseView,
  caseRecoveredAfterFailure,
  getCaseFailure,
} from './model';
import {
  type OverviewProject,
  fileDisplayName,
  projectDisplayName,
} from './overview-model';
import { RecoveryWarning } from './status-badge';
import { CaseStatus, caseStatusLabel } from './view-primitives';

interface CaseNavigationProps {
  projects: readonly OverviewProject[];
  currentCaseKey: string;
  onOpenCase(item: RunnerCaseView, stepId?: string): void;
}

export function CaseNavigationList({
  projects,
  currentCaseKey,
  onOpenCase,
  currentRef,
}: CaseNavigationProps & { currentRef?: Ref<HTMLButtonElement> }) {
  return (
    <nav className="runner-case-list" aria-label="Cases">
      {projects
        .filter((project) => project.cases.length)
        .map((project) => (
          <section key={project.key} aria-label={projectDisplayName(project)}>
            <h3 title={projectDisplayName(project)}>
              {projectDisplayName(project)}
            </h3>
            {project.files.flatMap((file) =>
              file.cases.map((item) => (
                <button
                  type="button"
                  key={item.key}
                  ref={item.key === currentCaseKey ? currentRef : undefined}
                  aria-current={
                    item.key === currentCaseKey ? 'page' : undefined
                  }
                  aria-label={`Open ${item.testCase.name} in ${projectDisplayName(project)} from ${fileDisplayName(file)} · ${caseStatusLabel(item.status, !item.firstPass)}`}
                  onClick={() =>
                    onOpenCase(item, getCaseFailure(item.testCase)?.id)
                  }
                >
                  <span className="runner-case-list-copy">
                    <span>
                      <strong title={item.testCase.name}>
                        {item.testCase.name}
                      </strong>
                      {caseRecoveredAfterFailure(item) ? (
                        <RecoveryWarning />
                      ) : null}
                      <CaseStatus status={item.status} quiet />
                    </span>
                    <small title={fileDisplayName(file)}>
                      {fileDisplayName(file)}
                    </small>
                  </span>
                </button>
              )),
            )}
          </section>
        ))}
    </nav>
  );
}

export function CaseNavigation(props: CaseNavigationProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const currentRef = useRef<HTMLButtonElement>(null);
  if (
    props.projects.reduce((sum, project) => sum + project.cases.length, 0) < 2
  )
    return null;
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="runner-case-browse"
        aria-label="View all cases"
        title="View all cases"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <img src={menuIcon} width={16} height={16} alt="" />
      </button>
      <Drawer
        title="All cases"
        aria-label="All cases"
        placement="left"
        width="var(--runner-case-directory-width)"
        mask={false}
        rootClassName="runner-issue-drawer runner-case-drawer"
        rootStyle={{ position: 'fixed', inset: '134px 9px 56px 0' }}
        getContainer={() =>
          triggerRef.current?.closest<HTMLElement>('.test-runner-report') ??
          document.body
        }
        open={open}
        onClose={() => setOpen(false)}
        afterOpenChange={(visible) => {
          if (!visible) return;
          currentRef.current?.focus({ preventScroll: true });
          currentRef.current?.scrollIntoView({ block: 'nearest' });
        }}
        closeIcon={<img src={closeIcon} width={16} height={16} alt="" />}
      >
        <CaseNavigationList
          {...props}
          currentRef={currentRef}
          onOpenCase={(item, stepId) => {
            setOpen(false);
            if (item.key !== props.currentCaseKey)
              props.onOpenCase(item, stepId);
          }}
        />
      </Drawer>
    </>
  );
}
