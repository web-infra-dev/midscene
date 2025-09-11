import { CopyOutlined } from '@ant-design/icons';
import { Button, message } from 'antd';
import type React from 'react';
import type { CSSProperties } from 'react';
import type { SupportedLanguage } from '../../hooks/useCodeHighlight';

export type { SupportedLanguage };
import { useCodeHighlight } from '../../hooks/useCodeHighlight';

export interface CodeBlockProps {
  /** Code content to display */
  code: string;
  /** Programming language for syntax highlighting */
  language: SupportedLanguage;
  /** Optional label for the code block */
  label?: string;
  /** Whether to show copy button */
  showCopy?: boolean;
  /** Whether to show header with label and copy button */
  showHeader?: boolean;
  /** Custom styles for the container */
  style?: CSSProperties;
  /** Custom styles for the pre element */
  preStyle?: CSSProperties;
  /** Custom styles for the header */
  headerStyle?: CSSProperties;
  /** Maximum height for the code block */
  maxHeight?: string | number;
  /** Custom copy button text */
  copyButtonText?: string;
  /** Custom copy success message */
  copySuccessMessage?: string;
  /** Custom copy error message */
  copyErrorMessage?: string;
}

/**
 * Reusable code block component with syntax highlighting
 * Can be used across different parts of the application
 */
export const CodeBlock: React.FC<CodeBlockProps> = ({
  code,
  language,
  label,
  showCopy = true,
  showHeader = true,
  style,
  preStyle,
  headerStyle,
  maxHeight = '300px',
  copyButtonText = 'Copy',
  copySuccessMessage,
  copyErrorMessage = 'Copy failed',
}) => {
  const { highlightCode, getLanguageDisplayName } = useCodeHighlight();

  // Generate default label if not provided
  const displayLabel = label || getLanguageDisplayName(language);
  const defaultSuccessMessage =
    copySuccessMessage || `${displayLabel} code copied to clipboard`;

  const copyToClipboard = () => {
    navigator.clipboard
      .writeText(code)
      .then(() => {
        message.success(defaultSuccessMessage);
      })
      .catch(() => {
        message.error(copyErrorMessage);
      });
  };

  return (
    <div
      className="code-block-container"
      style={{ marginBottom: 16, ...style }}
    >
      {showHeader && (
        <div
          className="code-block-header"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 12px',
            backgroundColor: '#f5f5f5',
            borderRadius: '6px 6px 0 0',
            borderBottom: '1px solid #f2f4f7',
            ...headerStyle,
          }}
        >
          <span style={{ fontSize: '12px', color: '#666', fontWeight: 500 }}>
            {displayLabel}
          </span>
          {showCopy && (
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined />}
              onClick={copyToClipboard}
              style={{ padding: '2px 6px' }}
            >
              {copyButtonText}
            </Button>
          )}
        </div>
      )}
      <pre
        className="hljs"
        style={{
          margin: 0,
          padding: '12px',
          border: '1px solid #f2f4f7',
          borderTop: showHeader ? 'none' : '1px solid #f2f4f7',
          borderRadius: showHeader ? '0 0 6px 6px' : '6px',
          fontSize: '13px',
          lineHeight: '1.5',
          overflow: 'auto',
          maxHeight: maxHeight,
          ...preStyle,
        }}
        // Using dangerouslySetInnerHTML for syntax highlighting - content is sanitized by highlight.js
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Content is sanitized by highlight.js
        dangerouslySetInnerHTML={{
          __html: highlightCode(code, language),
        }}
      />
    </div>
  );
};
