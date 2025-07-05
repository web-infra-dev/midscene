import React from 'react';
import { Button, Typography } from 'antd';
import { CodeOutlined, ReloadOutlined, CopyOutlined, DownloadOutlined } from '@ant-design/icons';
import { ThinkingProcessSection } from './ThinkingProcessSection';

const { Text } = Typography;

interface PlaywrightCodeBlockProps {
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

export const PlaywrightCodeBlock: React.FC<PlaywrightCodeBlockProps> = ({
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
                {/* <div className="flex items-center gap-2">
                    <CodeOutlined className="text-blue-500" />
                    <Text strong>Playwright Test Code</Text>
                    {isStreaming && (
                        <div className="flex items-center gap-1 text-blue-500">
                            <div className="animate-spin w-3 h-3 border border-blue-500 border-t-transparent rounded-full"></div>
                            <Text className="text-xs text-blue-500">Streaming...</Text>
                        </div>
                    )}
                </div> */}
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
                        title="Download as .ts file"
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

            {/* 思考过程展示区域 */}
            <ThinkingProcessSection
                accumulatedThinking={accumulatedThinking}
                isStreaming={isStreaming}
                actualCode={actualCode}
                themeColor="blue"
            />
            <div className="relative">
                <pre className={`bg-gray-50 p-4 rounded border text-sm overflow-auto max-h-96 font-mono ${isStreaming ? 'border-blue-300' : 'border-gray-200'}`}>
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