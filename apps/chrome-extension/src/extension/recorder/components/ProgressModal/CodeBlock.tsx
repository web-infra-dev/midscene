import {
  CopyOutlined,
  DownloadOutlined,
  FileTextOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { Button, Typography } from 'antd';
import type React from 'react';
import { useEffect, useRef } from 'react';
import { ThinkingProcessSection } from './ThinkingProcessSection';
import { triggerConfetti } from './confetti';

import hljs from 'highlight.js/lib/core';
import yaml from 'highlight.js/lib/languages/yaml';
import javascript from 'highlight.js/lib/languages/javascript';

import 'highlight.js/styles/github.css';


hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('yaml', yaml);

const { Text } = Typography;

interface CodeBlockProps {
  type: 'yaml' | 'playwright';
  code: string;
  loading: boolean;
  onCopy?: () => void;
  onDownload?: () => void;
  onRegenerate?: () => void;
  stepDisplay: boolean;
  isStreaming?: boolean;
  streamingContent?: string;
  thinkingProcess?: string;
  actualCode?: string;
  accumulatedThinking?: string;
}

function CodeBlockContainer({ language, code, isStreaming }: { language: 'yaml' | 'javascript', code: string, isStreaming: boolean }) {
  const codeRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (codeRef.current && !isStreaming) {
      hljs.highlightElement(codeRef.current);
    }
  }, [code, language]);

  return (
    <pre>
      <code ref={codeRef} className={`language-${language}`}>
        {code}
      </code>
    </pre>
  );
}



export const CodeBlock: React.FC<CodeBlockProps> = ({
  type,
  code,
  isStreaming = false,
  streamingContent = '',
  actualCode = '',
  accumulatedThinking = '',
  stepDisplay,
}) => {
  let displayContent = isStreaming ? actualCode || streamingContent : code;
  displayContent = displayContent
    .replace('```typescript', '')
    .replace('```', '')
    .trim();
  const hasContent = displayContent.length > 0;
  const wasStreamingRef = useRef(false);

  // Monitor code generation completion, trigger confetti effect
  useEffect(() => {
    // If it was streaming before, now stopped, and has code content, trigger confetti effect
    if (wasStreamingRef.current && !isStreaming && hasContent) {
      triggerConfetti();
    }
    wasStreamingRef.current = isStreaming;
  }, [isStreaming, hasContent]);


  return (
    <div className="mt-5">
      {/* 按钮区域已移除，只在外部渲染 */}
      {/* Thinking Process Section */}
      <ThinkingProcessSection
        accumulatedThinking={accumulatedThinking}
        isStreaming={isStreaming}
        actualCode={actualCode}
        themeColor="green"
      />
      {stepDisplay && (<div className="relative">
        <pre
          className={`bg-gray-50 rounded-[8px] border text-sm overflow-auto max-h-128 font-mono border-radius-[8px] ${!actualCode ? 'p-4 border-[#F2F4F7]' : 'px-[12px]  border-gray-200'}`}
        >
          {
            displayContent ?
              (
                <CodeBlockContainer language={type === 'playwright' ? 'javascript' : 'yaml'} code={displayContent} isStreaming={isStreaming} />

              ) :
              isStreaming ? (
                <code>
                  Generating code...
                </code>
              ) : null
          }
        </pre>
        {isStreaming && !actualCode && (
          <div className="absolute bottom-4 right-2 bg-[#2B83FF1F] text-[#2B83FF] px-2 py-1 rounded-full text-xs">
            Analyzing...
          </div>
        )}
      </div>)}

      {code && (
        <div className="mt-3 text-center">
          <Text type="secondary" className="text-xs">
            {
              type === 'playwright' ? (
                <>
                  💡 Can be executed with <b>@midscene/web</b> compatible automation
                  frameworks. Run directly via <code>npx playwright test</code>.
                </>
              ) : (
                <>
                  💡 Use with any automation platform that supports{' '}
                  <b>@midscene/cli</b> for cross-platform integration and batch
                  execution.
                </>
              )
            }
          </Text>
        </div>
      )}
    </div>
  );
};
