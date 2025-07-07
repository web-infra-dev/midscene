import React, { useEffect, useRef } from 'react';
import { Button, Typography } from 'antd';
import { FileTextOutlined, ReloadOutlined, CopyOutlined, DownloadOutlined } from '@ant-design/icons';
import { ThinkingProcessSection } from './ThinkingProcessSection';
import { triggerConfetti } from './confetti';

const { Text } = Typography;

interface YamlCodeBlockProps {
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

export const YamlCodeBlock: React.FC<YamlCodeBlockProps> = ({
    code,
    loading,
    onCopy,
    onDownload,
    onRegenerate,
    isStreaming = false,
    streamingContent = '',
    thinkingProcess = '',
    actualCode = '',
    accumulatedThinking = '',
}) => {
    const displayContent = isStreaming ? (actualCode || streamingContent) : code;
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

            <div className="relative">
                <pre className={`bg-gray-50 p-4 rounded border text-sm overflow-auto max-h-128 font-mono ${isStreaming ? 'border-green-300' : 'border-gray-200'}`}>
                    <code>{displayContent || (isStreaming ? 'Generating code...' : 'No code generated yet')}</code>
                </pre>
                {isStreaming && (
                    <div className="absolute bottom-2 right-2 bg-green-100 text-green-600 px-2 py-1 rounded text-xs">
                        {actualCode ? 'Generating code...' : 'Analyzing...'}
                    </div>
                )}
            </div>
            {code && (
                <div className="mt-3 text-center">
                    <Text type="secondary" className="text-xs">
                        💡 Use with any automation platform that supports <b>@midscene/cli</b> for cross-platform integration and batch execution.
                    </Text>
                </div>
            )}
        </div>
    );
}; 