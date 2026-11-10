import groupChevron from './assets/overview-group-chevron.svg';
import groupDivider from './assets/overview-group-divider.svg';
import failedIcon from './assets/overview-project-failed.svg';
import passedIcon from './assets/overview-project-passed.svg';
import type { RunnerCaseStatus } from './model';
import {
  type OverviewProject,
  getOverviewProjectSummary,
  groupOverviewProjects,
  projectDisplayName,
  projectRecoveredAfterFailure,
} from './overview-model';
import { RecoveryWarning } from './status-badge';
import { StepStatus } from './view-primitives';

export function ProjectNavigation({
  projects,
  selectedKey,
  collapsedGroups,
  onSelect,
  onToggleGroup,
}: {
  projects: readonly OverviewProject[];
  selectedKey?: string;
  collapsedGroups: ReadonlySet<RunnerCaseStatus>;
  onSelect(key: string): void;
  onToggleGroup(status: RunnerCaseStatus): void;
}): JSX.Element {
  const groups = groupOverviewProjects(projects);
  return (
    <nav className="runner-project-navigation" aria-label="Projects">
      <h2>Projects</h2>
      {groups.map((group, index) => {
        const expanded = !collapsedGroups.has(group.status);
        const icon =
          group.status === 'failed'
            ? failedIcon
            : group.status === 'passed'
              ? passedIcon
              : undefined;
        return (
          <section className="runner-project-nav-group" key={group.status}>
            {index > 0 ? (
              <img
                className="runner-project-group-divider"
                src={groupDivider}
                width={304}
                height={1}
                alt=""
              />
            ) : null}
            <button
              type="button"
              className="runner-project-group-toggle"
              aria-expanded={expanded}
              onClick={() => onToggleGroup(group.status)}
              aria-label={`${expanded ? 'Collapse' : 'Expand'} ${group.label} projects (${group.projects.length})`}
            >
              <span className="runner-project-group-label">
                <span>{group.label}</span>
                <span>{group.projects.length}</span>
              </span>
              <img
                src={groupChevron}
                width={16}
                height={16}
                alt=""
                className={expanded ? '' : 'is-collapsed'}
              />
            </button>
            {expanded ? (
              <div className="runner-project-nav-items">
                {group.projects.map((item) => {
                  const name = projectDisplayName(item);
                  const summary = getOverviewProjectSummary(item);
                  return (
                    <button
                      type="button"
                      className={`runner-project-nav-item${selectedKey === item.key ? ' is-selected' : ''}`}
                      key={item.key}
                      aria-current={
                        selectedKey === item.key ? 'true' : undefined
                      }
                      aria-label={`Select project ${name}`}
                      aria-describedby={`project-summary-${item.key}`}
                      onClick={() => onSelect(item.key)}
                    >
                      <span className="runner-project-nav-copy">
                        <span className="runner-project-nav-name">
                          <strong title={name}>{name}</strong>
                          {projectRecoveredAfterFailure(item) ? (
                            <RecoveryWarning />
                          ) : null}
                        </span>
                        <small
                          id={`project-summary-${item.key}`}
                          title={summary}
                        >
                          {summary}
                        </small>
                      </span>
                      {icon ? (
                        <img
                          src={icon}
                          width={16}
                          height={16}
                          alt={group.label}
                        />
                      ) : (
                        <StepStatus status="not-run" />
                      )}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </section>
        );
      })}
      {!projects.length ? (
        <p className="runner-project-nav-empty">No matching projects</p>
      ) : null}
    </nav>
  );
}
