import type { ReactNode } from 'react';
import { StudioModeTab } from '../../recorder/types';
import {
  ApiPlaygroundModeIcon,
  RecorderModeIcon,
  ReplayModeIcon,
} from '../PlaygroundShell/mode-icons';
import './studio-timeline-panel.css';

export type StudioTimelinePanelVariant =
  | StudioModeTab.Record
  | StudioModeTab.Replay
  | StudioModeTab.Playground;

export interface StudioTimelinePanelProps {
  ariaHidden?: boolean;
  children: ReactNode;
  className?: string;
  collapsed?: boolean;
  contentClassName?: string;
  empty?: boolean;
  expanded?: boolean;
  footer?: ReactNode;
  headerAction?: ReactNode;
  onToggleCollapsed?: () => void;
  scrollBody?: boolean;
  variant: StudioTimelinePanelVariant;
}

export type StudioExecutionTimelinePanelProps = Omit<
  StudioTimelinePanelProps,
  'className' | 'contentClassName' | 'expanded' | 'scrollBody'
> & {
  className?: string;
  contentClassName?: string;
};

function TimelineHeaderChevronIcon({ collapsed }: { collapsed?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={collapsed ? 'studio-timeline-chevron-collapsed' : undefined}
      fill="none"
      viewBox="0 0 16 16"
    >
      <path
        d="m4 6 4 4 4-4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.333"
      />
    </svg>
  );
}

function StudioTimelinePanelIcon({
  variant,
}: {
  variant: StudioTimelinePanelVariant;
}) {
  if (variant === StudioModeTab.Replay) {
    return <ReplayModeIcon />;
  }

  if (variant === StudioModeTab.Playground) {
    return <ApiPlaygroundModeIcon />;
  }

  return <RecorderModeIcon />;
}

export function StudioTimelineEmptyState({
  description,
  title,
  variant,
}: {
  description: string;
  title: string;
  variant: StudioTimelinePanelVariant;
}) {
  return (
    <div className="studio-timeline-empty-state">
      <div className="studio-timeline-empty-state-icon">
        <StudioTimelinePanelIcon variant={variant} />
      </div>
      <div className="studio-timeline-empty-state-title">{title}</div>
      <div className="studio-timeline-empty-state-description">
        {description}
      </div>
    </div>
  );
}

function StudioTimelinePanelHeader({
  collapsed,
  headerAction,
  onToggleCollapsed,
  variant,
}: {
  collapsed?: boolean;
  headerAction?: ReactNode;
  onToggleCollapsed?: () => void;
  variant: StudioTimelinePanelVariant;
}) {
  const titleContent = (
    <>
      <StudioTimelinePanelIcon variant={variant} />
      <span>Timeline</span>
      {onToggleCollapsed ? (
        <TimelineHeaderChevronIcon collapsed={collapsed} />
      ) : null}
    </>
  );

  return (
    <header className="studio-timeline-panel-header">
      {onToggleCollapsed ? (
        <button
          aria-expanded={!collapsed}
          aria-label={
            collapsed ? 'Expand timeline panel' : 'Collapse timeline panel'
          }
          className="studio-timeline-panel-title"
          onClick={onToggleCollapsed}
          type="button"
        >
          {titleContent}
        </button>
      ) : (
        <div className="studio-timeline-panel-title">{titleContent}</div>
      )}
      {headerAction ? (
        <div className="studio-timeline-panel-header-action">
          {headerAction}
        </div>
      ) : null}
    </header>
  );
}

export function StudioTimelineHeader({
  collapsed,
  headerAction,
  onToggleCollapsed,
  variant,
}: {
  collapsed?: boolean;
  headerAction?: ReactNode;
  onToggleCollapsed?: () => void;
  variant: StudioTimelinePanelVariant;
}) {
  return (
    <StudioTimelinePanelHeader
      collapsed={collapsed}
      headerAction={headerAction}
      onToggleCollapsed={onToggleCollapsed}
      variant={variant}
    />
  );
}

export function StudioTimelinePanel({
  ariaHidden,
  children,
  className,
  collapsed,
  contentClassName,
  empty,
  expanded,
  footer,
  headerAction,
  onToggleCollapsed,
  scrollBody,
  variant,
}: StudioTimelinePanelProps) {
  const panelClassName = [
    'studio-timeline-panel',
    empty ? 'studio-timeline-panel-empty' : '',
    expanded ? 'studio-timeline-panel-expanded' : '',
    collapsed ? 'studio-timeline-panel-collapsed' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  const bodyClassName = [
    'studio-timeline-panel-body',
    scrollBody ? 'studio-timeline-panel-scroll-body' : '',
    contentClassName,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <section className={panelClassName}>
      <StudioTimelinePanelHeader
        collapsed={collapsed}
        headerAction={headerAction}
        onToggleCollapsed={onToggleCollapsed}
        variant={variant}
      />
      <div aria-hidden={ariaHidden} className={bodyClassName}>
        {children}
      </div>
      {footer}
    </section>
  );
}

export function StudioExecutionTimelinePanel({
  className,
  contentClassName,
  empty,
  ...props
}: StudioExecutionTimelinePanelProps) {
  return (
    <StudioTimelinePanel
      {...props}
      className={[
        'studio-playground-timeline-panel',
        'studio-execution-timeline-skin',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      contentClassName={[
        'studio-playground-timeline-panel-body',
        contentClassName,
      ]
        .filter(Boolean)
        .join(' ')}
      empty={empty}
      expanded={!empty}
      scrollBody={!empty}
    />
  );
}
