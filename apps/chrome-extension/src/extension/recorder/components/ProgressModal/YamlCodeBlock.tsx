import React from 'react';
import { Button, Typography } from 'antd';
import { FileTextOutlined, ReloadOutlined, CopyOutlined, DownloadOutlined } from '@ant-design/icons';
import { ThinkingProcessSection } from './ThinkingProcessSection';

const { Text } = Typography;

interface YamlCodeBlockProps {
    code: string;
    loading: boolean;
    onCopy: () => void;
    onDownload: () => void;
    onRegenerate: () => void;
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

    return (
        <div className="mt-5">
            <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-2">
                    <FileTextOutlined className="text-green-500" />
                    <Text strong>YAML Configuration</Text>
                    {isStreaming && (
                        <div className="flex items-center gap-1 text-green-500">
                            <div className="animate-spin w-3 h-3 border border-green-500 border-t-transparent rounded-full"></div>
                            <Text className="text-xs text-green-500">Streaming...</Text>
                        </div>
                    )}
                </div>
                <div className="flex gap-2">
                    <Button
                        size="small"
                        icon={<CopyOutlined />}
                        onClick={onCopy}
                        disabled={!hasContent || isStreaming}
                        title="Copy to clipboard"
                    >
                        Copy
                    </Button>
                    <Button
                        size="small"
                        icon={<DownloadOutlined />}
                        onClick={onDownload}
                        disabled={!hasContent || isStreaming}
                        title="Download as .yaml file"
                    >
                        Download
                    </Button>
                    <Button
                        size="small"
                        icon={<ReloadOutlined />}
                        onClick={onRegenerate}
                        disabled={loading || isStreaming}
                        title="Regenerate code"
                    >
                        Regenerate
                    </Button>
                </div>
            </div>

            {/* Thinking Process Section */}
            <ThinkingProcessSection
                accumulatedThinking={accumulatedThinking}
                isStreaming={isStreaming}
                actualCode={actualCode}
                themeColor="green"
            />

            <div className="relative">
                <pre className={`bg-gray-50 p-4 rounded border text-sm overflow-auto max-h-96 font-mono ${isStreaming ? 'border-green-300' : 'border-gray-200'}`}>
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