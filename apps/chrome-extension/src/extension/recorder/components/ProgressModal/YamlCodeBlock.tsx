import React from 'react';
import { Button, Typography } from 'antd';
import { FileTextOutlined, ReloadOutlined, CopyOutlined, DownloadOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface YamlCodeBlockProps {
    code: string;
    loading: boolean;
    onCopy: () => void;
    onDownload: () => void;
    onRegenerate: () => void;
}

export const YamlCodeBlock: React.FC<YamlCodeBlockProps> = ({
    code,
    loading,
    onCopy,
    onDownload,
    onRegenerate,
}) => {
    return (
        <div className="mt-5">
            <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-2">
                    <FileTextOutlined />
                    <Text strong>YAML Configuration</Text>
                </div>
                <div className="flex gap-2">
                    <Button icon={<ReloadOutlined />} onClick={onRegenerate} disabled={loading} size="small">Regenerate</Button>
                    <Button icon={<CopyOutlined />} onClick={onCopy} size="small">Copy</Button>
                    <Button type="primary" icon={<DownloadOutlined />} onClick={onDownload} size="small">Download</Button>
                </div>
            </div>
            <div className="max-h-[55vh] overflow-auto bg-[#1e1e1e] p-4 rounded-md border border-gray-300 font-mono">
                <pre className="m-0 whitespace-pre-wrap text-[#d4d4d4] text-[13px] leading-[1.5] tab-size-[2]">
                    {code || 'Generated code will appear here...'}
                </pre>
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