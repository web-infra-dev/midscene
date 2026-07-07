import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { saveStudioRecorderFile } from '../../recorder/export';

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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [menuOpen]);

  const downloadMarkdown = async () => {
    if (onDownload) {
      await onDownload();
      setMenuOpen(false);
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
    setMenuOpen(false);
  };

  return (
    <section className="studio-right-panel-markdown">
      <header className="studio-right-panel-markdown-header">
        <div className="studio-right-panel-markdown-title">
          <span>{title || 'Markdown'}</span>
        </div>
        <div
          className="app-no-drag studio-right-panel-markdown-menu"
          ref={menuRef}
        >
          <button
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-label="More markdown actions"
            className="studio-right-panel-markdown-more"
            onClick={() => setMenuOpen((open) => !open)}
            title="More"
            type="button"
          >
            <svg
              aria-hidden="true"
              fill="none"
              height="16"
              viewBox="0 0 16 16"
              width="16"
            >
              <circle cx="4" cy="8" fill="currentColor" r="1.2" />
              <circle cx="8" cy="8" fill="currentColor" r="1.2" />
              <circle cx="12" cy="8" fill="currentColor" r="1.2" />
            </svg>
          </button>
          {menuOpen ? (
            <div
              className="app-no-drag studio-right-panel-markdown-dropdown"
              role="menu"
            >
              <button
                className="studio-right-panel-markdown-dropdown-item"
                onClick={() => {
                  void downloadMarkdown();
                }}
                role="menuitem"
                type="button"
              >
                Download
              </button>
              <button
                className="studio-right-panel-markdown-dropdown-item studio-right-panel-markdown-dropdown-item-danger"
                onClick={() => {
                  setMenuOpen(false);
                  void onDelete();
                }}
                role="menuitem"
                type="button"
              >
                Delete
              </button>
            </div>
          ) : null}
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
    <div className="studio-right-panel">
      <button
        aria-label="Close studio right panel"
        className="app-no-drag studio-right-panel-close"
        onClick={onClose}
        type="button"
      >
        <span aria-hidden="true">×</span>
      </button>
      {content}
    </div>
  );
}
