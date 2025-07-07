import React, { useEffect, useRef } from 'react';
import { Button, Typography } from 'antd';
import { CodeOutlined, ReloadOutlined, CopyOutlined, DownloadOutlined } from '@ant-design/icons';
import { ThinkingProcessSection } from './ThinkingProcessSection';
import { triggerConfetti } from './confetti';

const { Text } = Typography;

interface PlaywrightCodeBlockProps {
    code: string;
    loading: boolean;
    onCopy?: () => void;
    onDownload?: () => void;
    onRegenerate?: () => void;
    isStreaming?: boolean;
    streamingContent?: string;
    thinkingProcess?: string;
    actualCode?: string;
    accumulatedThinking?: string;
}

export const PlaywrightCodeBlock: React.FC<PlaywrightCodeBlockProps> = ({
    code,
    isStreaming = false,
    streamingContent = '',
    actualCode = '',
    accumulatedThinking = '',
}) => {
    const displayContent = isStreaming ? (actualCode || streamingContent) : code;
    const hasContent = displayContent.length > 0;
    const wasStreamingRef = useRef(false);

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
            {/* Thinking process display area */}
            <ThinkingProcessSection
                accumulatedThinking={accumulatedThinking}
                isStreaming={isStreaming}
                actualCode={actualCode}
                themeColor="blue"
            />
            <div className="relative">
                <pre className={`bg-gray-50 p-4 rounded border text-sm overflow-auto max-h-128font-mono ${isStreaming ? 'border-blue-300' : 'border-gray-200'}`}>
                    <code>{displayContent || (isStreaming ? 'Generating code...' : 'No code generated yet')}</code>
                </pre>
                {isStreaming && (
                    <div className="absolute bottom-2 right-2 bg-blue-100 text-blue-600 px-2 py-1 rounded text-xs">
                        {actualCode ? 'Generating code...' : 'Analyzing...'}
                    </div>
                )}
            </div>
            {code && (
                <div className="mt-3 text-center">
                    <Text type="secondary" className="text-xs">
                        💡 Can be executed with <b>@midscene/web</b> compatible automation frameworks. Run directly via <code>npx playwright test</code>.
                    </Text>
                </div>
            )}
        </div>
    );
}; 