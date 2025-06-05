import React, { useState } from 'react';
import { Button, Space, Modal, message, Typography } from 'antd';
import { PlayCircleOutlined, DownloadOutlined, CopyOutlined, CodeOutlined } from '@ant-design/icons';
import type { ChromeRecordedEvent } from '@midscene/record';
import { exportEventsToFile } from './utils';
import { generatePlaywrightTest } from './generatePlaywrightTest';

const { Text } = Typography;

/**
 * Component that provides controls for exporting recorded events as Playwright tests
 */
export const PlaywrightExportControls: React.FC<{
  sessionName: string;
  events: ChromeRecordedEvent[];
}> = ({ sessionName, events }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [showTestModal, setShowTestModal] = useState(false);
  const [generatedTest, setGeneratedTest] = useState('');

  // Generate Playwright test from recorded events
  const handleGenerateTest = async () => {
    if (events.length === 0) {
      message.warning('No events to generate test from');
      return;
    }

    setIsGenerating(true);
    try {
      const testCode = await generatePlaywrightTest(events, {
        testName: `Test: ${sessionName}`,
        waitForNetworkIdle: true,
        waitForNetworkIdleTimeout: 2000,
      });

      setGeneratedTest(testCode);
      setShowTestModal(true);
      message.success('AI Playwright test generated successfully!');
    } catch (error) {
      console.error('Failed to generate Playwright test:', error);
      message.error(`Failed to generate test: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // Copy generated test to clipboard
  const handleCopyTest = () => {
    navigator.clipboard.writeText(generatedTest);
    message.success('Test copied to clipboard');
  };

  // Download generated test as a TypeScript file
  const handleDownloadTest = () => {
    const dataBlob = new Blob([generatedTest], { type: 'application/typescript' });
    const url = URL.createObjectURL(dataBlob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `${sessionName}-playwright-test.ts`;
    link.click();

    URL.revokeObjectURL(url);
    message.success(`Playwright test for "${sessionName}" downloaded successfully`);
  };

  // Export original events as JSON
  const handleExportEvents = () => {
    exportEventsToFile(events, sessionName);
  };

  return (
    <>
      <Space>
        <Button
          icon={<CodeOutlined />}
          onClick={handleGenerateTest}
          loading={isGenerating}
          disabled={events.length === 0}
          type="primary"
        >
          {isGenerating ? 'Generating AI Test...' : 'Generate Playwright Test'}
        </Button>

        <Button
          icon={<DownloadOutlined />}
          onClick={handleExportEvents}
          disabled={events.length === 0}
        >
          Export Events as JSON
        </Button>
      </Space>

      <Modal
        title={
          <Space>
            <CodeOutlined />
            <span>AI-Generated Playwright Test</span>
          </Space>
        }
        open={showTestModal}
        onCancel={() => setShowTestModal(false)}
        width={900}
        footer={[
          <Text key="info" type="secondary" style={{ marginRight: 'auto' }}>
            Ready to use TypeScript test file
          </Text>,
          <Button key="close" onClick={() => setShowTestModal(false)}>
            Close
          </Button>,
          <Button
            key="copy"
            icon={<CopyOutlined />}
            onClick={handleCopyTest}
          >
            Copy to Clipboard
          </Button>,
          <Button
            key="download"
            type="primary"
            icon={<DownloadOutlined />}
            onClick={handleDownloadTest}
          >
            Download Test File
          </Button>,
        ]}
      >
        <div style={{ marginBottom: '12px' }}>
          <Text type="secondary">
            This test uses <strong>@midscene/web/playwright</strong> for AI-powered web automation.
          </Text>
        </div>

        <div
          style={{
            maxHeight: '65vh',
            overflow: 'auto',
            background: '#1e1e1e',
            padding: '16px',
            borderRadius: '6px',
            border: '1px solid #d9d9d9',
            fontFamily: '"Fira Code", "Consolas", "Monaco", monospace'
          }}
        >
          <pre
            style={{
              margin: 0,
              whiteSpace: 'pre-wrap',
              color: '#d4d4d4',
              fontSize: '13px',
              lineHeight: '1.5',
              tabSize: 2
            }}
          >
            {generatedTest || 'Generated test code will appear here...'}
          </pre>
        </div>

        {generatedTest && (
          <div style={{ marginTop: '12px', textAlign: 'center' }}>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              💡 Tip: This test is ready to run with <code>npx playwright test</code>
            </Text>
          </div>
        )}
      </Modal>
    </>
  );
};