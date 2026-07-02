import { useMemo } from 'react';
import type { ReactNode } from 'react';

interface MarkdownSourceProps {
  markdown: string;
  onImageClick?: (markdownPath: string) => void;
}

type MarkdownLineKind =
  | 'blank'
  | 'code'
  | 'fence'
  | 'heading'
  | 'image'
  | 'list'
  | 'table'
  | 'text';

interface MarkdownLine {
  text: string;
  kind: MarkdownLineKind;
}

const imageLinkPattern = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

function buildMarkdownLines(markdown: string): MarkdownLine[] {
  let inCodeBlock = false;

  return markdown.split('\n').map((text) => {
    const trimmed = text.trim();

    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      return { text, kind: 'fence' };
    }

    if (inCodeBlock) {
      return { text, kind: 'code' };
    }

    if (!trimmed) {
      return { text, kind: 'blank' };
    }

    if (/^#{1,6}\s+/.test(trimmed)) {
      return { text, kind: 'heading' };
    }

    if (imageLinkPattern.test(text)) {
      imageLinkPattern.lastIndex = 0;
      return { text, kind: 'image' };
    }
    imageLinkPattern.lastIndex = 0;

    if (/^\|.*\|$/.test(trimmed)) {
      return { text, kind: 'table' };
    }

    if (/^[-*]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
      return { text, kind: 'list' };
    }

    return { text, kind: 'text' };
  });
}

function renderLineContent(
  line: string,
  onImageClick?: (markdownPath: string) => void,
): ReactNode {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  imageLinkPattern.lastIndex = 0;

  for (const match of line.matchAll(imageLinkPattern)) {
    const matchIndex = match.index ?? 0;
    const [raw, altText, markdownPath] = match;

    if (matchIndex > cursor) {
      nodes.push(line.slice(cursor, matchIndex));
    }

    nodes.push(
      <button
        type="button"
        className="agent-markdown-image-link"
        key={`${markdownPath}-${matchIndex}`}
        title={markdownPath}
        onClick={() => onImageClick?.(markdownPath)}
      >
        ![{altText}]({markdownPath})
      </button>,
    );
    cursor = matchIndex + raw.length;
  }

  if (cursor < line.length) {
    nodes.push(line.slice(cursor));
  }

  return nodes.length ? nodes : line || '\u00a0';
}

const MarkdownSource = ({
  markdown,
  onImageClick,
}: MarkdownSourceProps): JSX.Element => {
  const lines = useMemo(() => buildMarkdownLines(markdown), [markdown]);

  return (
    <div className="agent-markdown-source" role="document">
      {lines.map((line, index) => (
        <div
          className={`agent-markdown-line line-${line.kind}`}
          key={`${index}-${line.kind}`}
        >
          {renderLineContent(line.text, onImageClick)}
        </div>
      ))}
    </div>
  );
};

export default MarkdownSource;
