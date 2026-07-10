import './index.less';

import { Empty } from 'antd';
import { useEffect, useMemo, useRef } from 'react';
import {
  type MarkdownView,
  getMarkdownAttachmentDisplayItems,
} from '../../utils/markdown-export';

interface AgentScreenshotViewProps {
  markdownView?: MarkdownView | null;
  selectedMarkdownImagePath?: string | null;
  selectedMarkdownImageRequestId?: number;
}

const AgentScreenshotView = ({
  markdownView,
  selectedMarkdownImagePath,
  selectedMarkdownImageRequestId,
}: AgentScreenshotViewProps): JSX.Element => {
  const readyMarkdown =
    markdownView?.status === 'ready' ? markdownView : undefined;
  const itemRefs = useRef(new Map<string, HTMLElement>());

  const screenshots = useMemo(
    () =>
      readyMarkdown
        ? getMarkdownAttachmentDisplayItems(readyMarkdown.attachments)
        : [],
    [readyMarkdown],
  );

  useEffect(() => {
    if (!selectedMarkdownImagePath) {
      return;
    }

    const selectedItem = itemRefs.current.get(selectedMarkdownImagePath);
    selectedItem?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [selectedMarkdownImagePath, selectedMarkdownImageRequestId]);

  return (
    <div className="agent-screenshot-view">
      <div className="agent-screenshot-header">
        <div className="agent-screenshot-title">
          Screenshots
          <span className="agent-screenshot-count">{screenshots.length}</span>
        </div>
      </div>
      {screenshots.length ? (
        <div className="agent-screenshot-list">
          {screenshots.map((screenshot, index) => (
            <figure
              className={`agent-screenshot-item ${
                selectedMarkdownImagePath === screenshot.markdownPath
                  ? 'selected'
                  : ''
              }`}
              key={screenshot.key}
              data-markdown-path={screenshot.markdownPath}
              ref={(node) => {
                if (node) {
                  itemRefs.current.set(screenshot.markdownPath, node);
                } else {
                  itemRefs.current.delete(screenshot.markdownPath);
                }
              }}
            >
              <figcaption>
                <span className="agent-screenshot-index">#{index + 1}</span>
                <span className="agent-screenshot-file">
                  <span
                    className="agent-screenshot-file-name"
                    title={screenshot.fileName}
                  >
                    {screenshot.fileName}
                  </span>
                  <code
                    className="agent-screenshot-path"
                    title={screenshot.markdownPath}
                  >
                    {screenshot.markdownPath}
                  </code>
                </span>
              </figcaption>
              <div className="agent-screenshot-image-frame">
                {screenshot.previewSrc ? (
                  <img
                    src={screenshot.previewSrc}
                    alt={screenshot.markdownPath}
                    loading="lazy"
                  />
                ) : (
                  <div className="agent-screenshot-preview-missing">
                    Preview unavailable
                  </div>
                )}
              </div>
            </figure>
          ))}
        </div>
      ) : (
        <div className="agent-screenshot-empty">
          <Empty description="No screenshots available" />
        </div>
      )}
    </div>
  );
};

export default AgentScreenshotView;
