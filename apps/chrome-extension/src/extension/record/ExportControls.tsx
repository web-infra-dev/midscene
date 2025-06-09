import {
  CodeOutlined,
  CopyOutlined,
  DownloadOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import type { ChromeRecordedEvent } from '@midscene/record';
import { Button, Dropdown, Modal, Space, Typography, message } from 'antd';
import type { MenuProps } from 'antd';
import type React from 'react';
import { useState } from 'react';
import { useRecordingSessionStore } from '../../store';
import {
  generatePlaywrightTest,
  generateYamlTest,
} from './generators';
import { recordLogger } from './logger';
import {
  checkElementDescriptions,
  getLatestEvents,
  resolveSessionName,
  stopRecordingIfActive,
  waitForElementDescriptions,
} from './shared/exportControlsUtils';
import { exportEventsToFile, generateRecordTitle } from './utils';

const { Text } = Typography;

/**
 * Component that provides controls for exporting recorded events in various formats
 */
export const ExportControls: React.FC<{
  sessionName: string;
  events: ChromeRecordedEvent[];
  sessionId?: string;
  onStopRecording?: () => void | Promise<void>;
}> = ({ sessionName, events, sessionId, onStopRecording }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [showTestModal, setShowTestModal] = useState(false);
  const [showYamlModal, setShowYamlModal] = useState(false);
  const [generatedTest, setGeneratedTest] = useState('');
  const [generatedYaml, setGeneratedYaml] = useState('');
  const { updateSession } = useRecordingSessionStore();
  // const { events: liveEvents, isRecording } = useRecordStore();

  // Create a function to get the latest events with AI descriptions
  const getCurrentEvents = (): ChromeRecordedEvent[] => {
    return getLatestEvents(events, sessionId);
  };

  // Generate session title and description using AI
  const generateSessionTitleAndDescription = async (
    finalEvents: ChromeRecordedEvent[],
  ): Promise<string> => {
    let currentSessionName = sessionName; // Default to the original prop

    if (sessionId) {
      const session = useRecordingSessionStore
        .getState()
        .sessions.find((s) => s.id === sessionId);

      if (
        session &&
        (!session.name || session.name.includes('-') || !session.description)
      ) {
        recordLogger.info(
          'Generating session title and description before export',
        );
        const { title, description } = await generateRecordTitle(finalEvents);

        if (title || description) {
          updateSession(sessionId, {
            name: title || session.name,
            description: description || session.description,
          });
          message.success('Session title and description generated');

          // Update the session name to use for export
          currentSessionName = title || session.name;
        }
      } else if (session) {
        // Use the current session name from the store in case it was updated elsewhere
        currentSessionName = session.name;
      }
    }

    return currentSessionName;
  };

  // Generate Playwright test from recorded events
  const handleGenerateTest = async () => {
    // Get the most current events
    const currentEvents = getCurrentEvents();

    if (currentEvents.length === 0) {
      message.warning('No events to generate test from');
      return;
    }

    setIsGenerating(true);
    try {
      // Step 0: Stop recording if currently recording
      await stopRecordingIfActive(onStopRecording);

      // After stopping recording, get the latest events from session
      const finalEvents = getCurrentEvents();

      // Step 1: Generate session title and description if not already generated
      const currentSessionName =
        await generateSessionTitleAndDescription(finalEvents);

      // Step 2: Wait for all element descriptions to be generated
      recordLogger.info('Checking element descriptions before test generation');
      if (!checkElementDescriptions(finalEvents)) {
        message.loading('Waiting for element descriptions to complete...', 0);
        await waitForElementDescriptions(getCurrentEvents);
        message.destroy();
        recordLogger.success('Element descriptions ready for test generation');
      }

      // Step 3: Generate Playwright test
      const latestEvents = getCurrentEvents();

      recordLogger.info('Events ready for test generation', {
        events: latestEvents,
        eventsCount: latestEvents.length,
      });

      const testCode = await generatePlaywrightTest(latestEvents);

      setGeneratedTest(testCode);
      setShowTestModal(true);
      message.success('AI Playwright test generated successfully!');
    } catch (error) {
      recordLogger.error(
        'Failed to generate Playwright test',
        undefined,
        error,
      );
      message.error(
        `Failed to generate test: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    } finally {
      setIsGenerating(false);
    }
  };

  // Generate YAML test from recorded events
  const handleGenerateYaml = async () => {
    // Get the most current events
    const currentEvents = getCurrentEvents();

    if (currentEvents.length === 0) {
      message.warning('No events to generate YAML from');
      return;
    }

    setIsGenerating(true);
    try {
      // Step 0: Stop recording if currently recording
      await stopRecordingIfActive(onStopRecording);

      // After stopping recording, get the latest events from session
      const finalEvents = getCurrentEvents();

      // Step 1: Generate session title and description if not already generated
      const currentSessionName =
        await generateSessionTitleAndDescription(finalEvents);

      // Step 2: Wait for all element descriptions to be generated
      recordLogger.info('Checking element descriptions before YAML generation');
      if (!checkElementDescriptions(finalEvents)) {
        message.loading('Waiting for element descriptions to complete...', 0);
        await waitForElementDescriptions(getCurrentEvents);
        message.destroy();
        recordLogger.success('Element descriptions ready for YAML generation');
      }

      // Step 3: Generate YAML test
      const latestEvents = getCurrentEvents();

      recordLogger.info('Events ready for YAML generation', {
        events: latestEvents,
        eventsCount: latestEvents.length,
      });

      const yamlContent = await generateYamlTest(latestEvents, {
        testName: `Test: ${currentSessionName}`,
        description: `Test session recorded on ${new Date().toLocaleDateString()}`,
        includeScreenshots: false,
        includeTimestamps: true,
      });

      setGeneratedYaml(yamlContent);
      setShowYamlModal(true);
      message.success('AI YAML test generated successfully!');
    } catch (error) {
      recordLogger.error('Failed to generate YAML test', undefined, error);
      message.error(
        `Failed to generate YAML: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    } finally {
      setIsGenerating(false);
    }
  };

  // Copy generated test to clipboard
  const handleCopyTest = () => {
    navigator.clipboard.writeText(generatedTest);
    message.success('Test copied to clipboard');
  };

  // Copy generated YAML to clipboard
  const handleCopyYaml = () => {
    navigator.clipboard.writeText(generatedYaml);
    message.success('YAML copied to clipboard');
  };

  // Download generated test as a TypeScript file
  const handleDownloadTest = () => {
    const downloadSessionName = resolveSessionName(sessionName, sessionId);

    const dataBlob = new Blob([generatedTest], {
      type: 'application/typescript',
    });
    const url = URL.createObjectURL(dataBlob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `${downloadSessionName}-playwright-test.ts`;
    link.click();

    URL.revokeObjectURL(url);
    message.success(
      `Playwright test for "${downloadSessionName}" downloaded successfully`,
    );
  };

  // Download generated YAML as a YAML file
  const handleDownloadYaml = () => {
    const downloadSessionName = resolveSessionName(sessionName, sessionId);

    const dataBlob = new Blob([generatedYaml], {
      type: 'application/x-yaml',
    });
    const url = URL.createObjectURL(dataBlob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `${downloadSessionName}-test.yaml`;
    link.click();

    URL.revokeObjectURL(url);
    message.success(
      `YAML test for "${downloadSessionName}" downloaded successfully`,
    );
  };

  // Export original events as JSON
  const handleExportEvents = () => {
    // Get the most current events
    const currentEvents = getCurrentEvents();

    const exportSessionName = resolveSessionName(sessionName, sessionId);
    exportEventsToFile(currentEvents, exportSessionName);
  };

  // Generate code dropdown menu items
  const generateCodeMenuItems: MenuProps['items'] = [
    {
      key: 'playwright',
      label: 'Playwright Test',
      icon: <CodeOutlined />,
      onClick: handleGenerateTest,
    },
    {
      key: 'yaml',
      label: 'YAML Test',
      icon: <FileTextOutlined />,
      onClick: handleGenerateYaml,
    },
  ];

  return (
    <>
      <Space>
        <Dropdown
          menu={{ items: generateCodeMenuItems }}
          disabled={getCurrentEvents().length === 0 || isGenerating}
          placement="bottomLeft"
        >
          <Button
            icon={<CodeOutlined />}
            loading={isGenerating}
            disabled={getCurrentEvents().length === 0}
            type="primary"
          >
            {isGenerating ? 'Generating Code...' : 'Generate Code'}
          </Button>
        </Dropdown>

        <Button
          icon={<DownloadOutlined />}
          onClick={handleExportEvents}
          disabled={getCurrentEvents().length === 0}
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
          <Button key="copy" icon={<CopyOutlined />} onClick={handleCopyTest}>
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
            This test uses <strong>@midscene/web/playwright</strong> for
            AI-powered web automation.
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
            fontFamily: '"Fira Code", "Consolas", "Monaco", monospace',
          }}
        >
          <pre
            style={{
              margin: 0,
              whiteSpace: 'pre-wrap',
              color: '#d4d4d4',
              fontSize: '13px',
              lineHeight: '1.5',
              tabSize: 2,
            }}
          >
            {generatedTest || 'Generated test code will appear here...'}
          </pre>
        </div>

        {generatedTest && (
          <div style={{ marginTop: '12px', textAlign: 'center' }}>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              💡 Tip: This test is ready to run with{' '}
              <code>npx playwright test</code>
            </Text>
          </div>
        )}
      </Modal>

      <Modal
        title={
          <Space>
            <FileTextOutlined />
            <span>AI-Generated YAML Test</span>
          </Space>
        }
        open={showYamlModal}
        onCancel={() => setShowYamlModal(false)}
        width={900}
        footer={[
          <Text key="info" type="secondary" style={{ marginRight: 'auto' }}>
            Ready to use YAML test configuration
          </Text>,
          <Button key="close" onClick={() => setShowYamlModal(false)}>
            Close
          </Button>,
          <Button key="copy" icon={<CopyOutlined />} onClick={handleCopyYaml}>
            Copy to Clipboard
          </Button>,
          <Button
            key="download"
            type="primary"
            icon={<DownloadOutlined />}
            onClick={handleDownloadYaml}
          >
            Download YAML File
          </Button>,
        ]}
      >
        <div style={{ marginBottom: '12px' }}>
          <Text type="secondary">
            This YAML configuration can be used with various automation
            frameworks that support <strong>@midscene/web</strong> integration.
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
            fontFamily: '"Fira Code", "Consolas", "Monaco", monospace',
          }}
        >
          <pre
            style={{
              margin: 0,
              whiteSpace: 'pre-wrap',
              color: '#d4d4d4',
              fontSize: '13px',
              lineHeight: '1.5',
              tabSize: 2,
            }}
          >
            {generatedYaml ||
              'Generated YAML configuration will appear here...'}
          </pre>
        </div>

        {generatedYaml && (
          <div style={{ marginTop: '12px', textAlign: 'center' }}>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              💡 Tip: This YAML can be used with automation frameworks that
              support @midscene/web
            </Text>
          </div>
        )}
      </Modal>
    </>
  );
};
