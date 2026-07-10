import type { ReactNode } from 'react';
import { saveStudioRecorderFile } from '../../recorder/export';
import { DownloadIcon, TrashIcon } from '../Recorder/assets/recorder-icons';
import { StudioActionMenu } from '../StudioActionMenu';

export enum StudioRightPanelViewType {
  Markdown = 'markdown',
  Screenshots = 'screenshots',
}

export type StudioRightPanelView =
  | {
      type: StudioRightPanelViewType.Markdown;
      markdown: string;
      onDelete?: () => void | Promise<void>;
      onDownload?: () => void | Promise<void>;
      title?: string;
    }
  | {
      content: ReactNode;
      type: StudioRightPanelViewType.Screenshots;
    };

export function getStudioRightPanelWidth(view: StudioRightPanelView): number {
  switch (view.type) {
    case StudioRightPanelViewType.Markdown:
      return 400;
    case StudioRightPanelViewType.Screenshots:
      return 400;
  }
}

function MarkdownDetailView({
  markdown,
  onDelete,
  onDownload,
  title,
}: {
  markdown: string;
  onDelete: () => void | Promise<void>;
  onDownload?: () => void | Promise<void>;
  title?: string;
}) {
  const downloadMarkdown = async () => {
    if (onDownload) {
      await onDownload();
      return;
    }

    const fileNameBase = (title || 'markdown')
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/^-+|-+$/g, '');

    await saveStudioRecorderFile({
      content: markdown,
      defaultFileName: `${fileNameBase || 'markdown'}.md`,
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
      title: 'Download Markdown',
    });
  };

  return (
    <section className="studio-right-panel-markdown">
      <header className="studio-right-panel-markdown-header">
        <div className="studio-right-panel-markdown-title">
          <span>{title || 'Markdown'}</span>
        </div>
        <div className="app-no-drag studio-right-panel-markdown-menu">
          <StudioActionMenu
            ariaLabel="More markdown actions"
            items={[
              {
                icon: <DownloadIcon />,
                label: 'Download',
                onClick: downloadMarkdown,
              },
              {
                danger: true,
                icon: <TrashIcon />,
                label: 'Delete',
                onClick: onDelete,
              },
            ]}
            triggerClassName="studio-right-panel-markdown-more"
          />
        </div>
      </header>
      <div className="studio-right-panel-markdown-body">
        <pre>{markdown}</pre>
      </div>
    </section>
  );
}

export function StudioRightPanel({
  onClose,
  view,
}: {
  onClose: () => void;
  view: StudioRightPanelView;
}) {
  const content =
    view.type === StudioRightPanelViewType.Markdown ? (
      <MarkdownDetailView
        markdown={view.markdown}
        onDelete={async () => {
          await view.onDelete?.();
          onClose();
        }}
        onDownload={view.onDownload}
        title={view.title}
      />
    ) : (
      view.content
    );

  return (
    <div className="app-no-drag studio-right-panel">
      <button
        aria-label="Close studio right panel"
        className="app-no-drag studio-right-panel-close"
        onClick={onClose}
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
        type="button"
      >
        <span aria-hidden="true">×</span>
      </button>
      {content}
    </div>
  );
}
