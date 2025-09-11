import { CodeBlock as BaseCodeBlock } from '@midscene/visualizer';
import type { SupportedLanguage } from '@midscene/visualizer';
import { Typography } from 'antd';
import type React from 'react';
import { useEffect, useRef } from 'react';
import { ThinkingProcessSection } from './ThinkingProcessSection';
import { triggerConfetti } from './confetti';
import './CodeBlock.css';

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

function CodeBlockContainer({
  language,
  code,
  accumulatedThinking,
}: {
  language: 'yaml' | 'javascript';
  code: string;
  accumulatedThinking?: string;
  isStreaming: boolean;
}) {
  // Map language types
  const mappedLanguage: SupportedLanguage =
    language === 'javascript' ? 'javascript' : 'yaml';

  return (
    <BaseCodeBlock
      code={code}
      language={mappedLanguage}
      showHeader={false}
      showCopy={false}
      maxHeight={
        accumulatedThinking ? 'calc(100vh - 380px)' : 'calc(100vh - 340px)'
      }
      style={{
        marginBottom: 0,
      }}
    />
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
    .replace(/```typescript/g, '')
    .replace(/```/g, '')
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
    <div className="flex flex-col mt-5">
      {/* Thinking Process Section */}
      <ThinkingProcessSection
        accumulatedThinking={accumulatedThinking}
        isStreaming={isStreaming}
        actualCode={actualCode}
        themeColor="green"
      />
      {stepDisplay && (
        <div className="relative flex-1">
          {!displayContent && isStreaming && (
            <pre
              className={
                'relative bg-gray-50 rounded-[8px] border text-sm overflow-auto max-h-128 font-mono border-radius-[8px] p-4 border-[#F2F4F7]'
              }
            >
              <code>Generating code...</code>

              <div className="absolute bottom-3 right-2 bg-[#2B83FF1F] text-[#2B83FF] px-2 py-1 rounded-full text-xs">
                Analyzing...
              </div>
            </pre>
          )}

          {displayContent && (
            <CodeBlockContainer
              accumulatedThinking={accumulatedThinking}
              language={type === 'playwright' ? 'javascript' : 'yaml'}
              code={displayContent}
              isStreaming={isStreaming}
            />
          )}
        </div>
      )}

      {code && (
        <div className="mt-3 text-center">
          <Text type="secondary" className="text-xs">
            {type === 'playwright' ? (
              <>
                💡 Learn how to integrate Playwright with Midscene.js
                <a
                  target="_blank"
                  href="https://midscenejs.com/integrate-with-playwright.html"
                  rel="noreferrer"
                >
                  {' '}
                  here
                </a>
                .
              </>
            ) : (
              <>
                💡 Learn how to integrate YAML scripts with Midscene.js
                <a
                  target="_blank"
                  href="https://midscenejs.com/automate-with-scripts-in-yaml.html"
                  rel="noreferrer"
                >
                  {' '}
                  here
                </a>
                .
              </>
            )}
          </Text>
        </div>
      )}
    </div>
  );
};
