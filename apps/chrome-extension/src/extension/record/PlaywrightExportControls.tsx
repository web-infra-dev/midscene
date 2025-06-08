import {
  CodeOutlined,
  CopyOutlined,
  DownloadOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import type { ChromeRecordedEvent } from '@midscene/record';
import { Button, Modal, Space, Typography, message } from 'antd';
import type React from 'react';
import { useState } from 'react';
import { useRecordStore, useRecordingSessionStore } from '../../store';
import { generatePlaywrightTest } from './generatePlaywrightTest';
import { exportEventsToYaml } from './generateYamlTest';
import { recordLogger } from './logger';
import { exportEventsToFile, generateRecordTitle } from './utils';

const { Text } = Typography;

/**
 * Component that provides controls for exporting recorded events as Playwright tests
 */
export const PlaywrightExportControls: React.FC<{
  sessionName: string;
  events: ChromeRecordedEvent[];
  sessionId?: string;
  onStopRecording?: () => void | Promise<void>;
}> = ({ sessionName, events, sessionId, onStopRecording }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExportingYaml, setIsExportingYaml] = useState(false);
  const [showTestModal, setShowTestModal] = useState(false);
  const [generatedTest, setGeneratedTest] = useState('');
  const { updateSession } = useRecordingSessionStore();
  const { events: liveEvents, isRecording } = useRecordStore();

  // Create a function to get the latest events with AI descriptions
  const getLatestEvents = (): ChromeRecordedEvent[] => {
    const currentLiveEvents = useRecordStore.getState().events;

    // If currently recording, always use live events as they have the most up-to-date AI descriptions
    if (isRecording && currentLiveEvents.length > 0) {
      recordLogger.info('Using live events during recording', {
        eventsCount: currentLiveEvents.length,
      });
      return currentLiveEvents;
    }

    // If not recording, compare live events and session events to find the most complete data
    if (sessionId) {
      const session = useRecordingSessionStore
        .getState()
        .sessions.find((s) => s.id === sessionId);
      const sessionEvents = session?.events || [];

      // If we have live events, prefer them as they are more up-to-date
      if (
        currentLiveEvents.length > 0 &&
        currentLiveEvents.length >= sessionEvents.length
      ) {
        recordLogger.info('Using live events (more recent)', {
          eventsCount: currentLiveEvents.length,
        });
        return currentLiveEvents;
      }

      recordLogger.info('Using session events', {
        eventsCount: sessionEvents.length,
      });
      return sessionEvents;
    }

    // Fallback to live events
    recordLogger.info('Using fallback live events', {
      eventsCount: currentLiveEvents.length,
    });
    return currentLiveEvents;
  };

  // Check if all elements have descriptions generated
  const checkElementDescriptions = (): boolean => {
    const currentEvents = getLatestEvents();
    const eventsNeedingDescriptions = currentEvents.filter(
      (event: ChromeRecordedEvent) =>
        event.type === 'click' ||
        event.type === 'input' ||
        event.type === 'scroll',
    );

    return eventsNeedingDescriptions.every(
      (event: ChromeRecordedEvent) =>
        event.elementDescription &&
        event.elementDescription !== 'AI is analyzing element...' &&
        !event.descriptionLoading,
    );
  };

  // Wait for all element descriptions to be generated
  const waitForElementDescriptions = (): Promise<void> => {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (checkElementDescriptions()) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 200); // Check every 200ms

      // Timeout after 30 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve();
      }, 30000);
    });
  };

  // Generate Playwright test from recorded events
  const handleGenerateTest = async () => {
    // Get the most current events
    const currentEvents =
      isRecording && liveEvents.length > 0 ? liveEvents : events;

    if (currentEvents.length === 0) {
      message.warning('No events to generate test from');
      return;
    }

    setIsGenerating(true);
    try {
      // Step 0: Stop recording if currently recording
      if (isRecording && onStopRecording) {
        recordLogger.info('Stopping recording before generating AI test');
        message.loading('Stopping recording...', 0);
        await Promise.resolve(onStopRecording());
        message.destroy();
        recordLogger.success(
          'Recording stopped, proceeding with test generation',
        );

        // Small delay to ensure events are fully saved to session
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      // After stopping recording, get the latest events from session
      const finalEvents = getLatestEvents();

      // Step 1: Generate session title and description if not already generated
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
            'Generating session title and description before test generation',
          );
          const { title, description } = await generateRecordTitle(finalEvents);

          if (title || description) {
            updateSession(sessionId, {
              name: title || session.name,
              description: description || session.description,
            });
            message.success('Session title and description generated');

            // Update the session name to use for test generation
            currentSessionName = title || session.name;
          }
        } else if (session) {
          // Use the current session name from the store in case it was updated elsewhere
          currentSessionName = session.name;
        }
      }

      // Step 2: Wait for all element descriptions to be generated
      recordLogger.info('Checking element descriptions before test generation');
      if (!checkElementDescriptions()) {
        message.loading('Waiting for element descriptions to complete...', 0);
        await waitForElementDescriptions();
        message.destroy();
        recordLogger.success('Element descriptions ready for test generation');
      }

      // Step 3: Generate Playwright test
      const latestEvents = getLatestEvents();

      recordLogger.info('Events ready for test generation', {
        events: latestEvents,
        eventsCount: latestEvents.length,
      });

      const testCode = await generatePlaywrightTest(latestEvents, {
        testName: `Test: ${currentSessionName}`,
        waitForNetworkIdle: true,
        waitForNetworkIdleTimeout: 2000,
      });

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

  // Copy generated test to clipboard
  const handleCopyTest = () => {
    navigator.clipboard.writeText(generatedTest);
    message.success('Test copied to clipboard');
  };

  // Download generated test as a TypeScript file
  const handleDownloadTest = () => {
    // Get the current session name from store if available
    let downloadSessionName = sessionName;
    if (sessionId) {
      const session = useRecordingSessionStore
        .getState()
        .sessions.find((s) => s.id === sessionId);
      if (session) {
        downloadSessionName = session.name;
      }
    }

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

  // Export original events as YAML
  const handleExportYaml = async () => {
    // Get the most current events
    const currentEvents =
      isRecording && liveEvents.length > 0 ? liveEvents : events;

    if (currentEvents.length === 0) {
      message.warning('No events to export as YAML');
      return;
    }

    setIsExportingYaml(true);
    try {
      // Step 0: Stop recording if currently recording
      if (isRecording && onStopRecording) {
        recordLogger.info('Stopping recording before YAML export');
        message.loading('Stopping recording...', 0);
        await Promise.resolve(onStopRecording());
        message.destroy();
        recordLogger.success('Recording stopped, proceeding with YAML export');

        // Small delay to ensure events are fully saved to session
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      // Step 1: Wait for all element descriptions to be generated
      recordLogger.info('Checking element descriptions before YAML export');
      if (!checkElementDescriptions()) {
        message.loading('Waiting for element descriptions to complete...', 0);
        await waitForElementDescriptions();
        message.destroy();
        recordLogger.success('Element descriptions ready for YAML export');
      }

      // After stopping recording and waiting for descriptions, get the latest events
      const finalEvents = getLatestEvents();

      // Get the current session name from store if available
      let exportSessionName = sessionName;
      if (sessionId) {
        const session = useRecordingSessionStore
          .getState()
          .sessions.find((s) => s.id === sessionId);
        if (session) {
          exportSessionName = session.name;
        }
      }

      recordLogger.info('Events ready for YAML export', {
        events: finalEvents,
        eventsCount: finalEvents.length,
      });

      message.loading('Generating AI-powered YAML test...', 0);
      
      await exportEventsToYaml(finalEvents, exportSessionName, {
        includeScreenshots: false, // Keep file size manageable
        includeTimestamps: true,
      });
      
      message.destroy();
      message.success(`YAML test exported for "${exportSessionName}"`);
    } catch (error) {
      message.destroy();
      recordLogger.error('Failed to export YAML', undefined, error);
      message.error(
        `Failed to export YAML: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    } finally {
      setIsExportingYaml(false);
    }
  };

  // Export original events as JSON
  const handleExportEvents = () => {
    // Get the most current events
    const currentEvents =
      isRecording && liveEvents.length > 0 ? liveEvents : events;

    // Get the current session name from store if available
    let exportSessionName = sessionName;
    if (sessionId) {
      const session = useRecordingSessionStore
        .getState()
        .sessions.find((s) => s.id === sessionId);
      if (session) {
        exportSessionName = session.name;
      }
    }
    exportEventsToFile(currentEvents, exportSessionName);
  };

  return (
    <>
      <Space>
        <Button
          icon={<CodeOutlined />}
          onClick={handleGenerateTest}
          loading={isGenerating}
          disabled={
            (isRecording && liveEvents.length === 0) ||
            (!isRecording && events.length === 0)
          }
          type="primary"
        >
          {isGenerating ? 'Generating AI Test...' : 'Generate Playwright Test'}
        </Button>

        <Button
          icon={<FileTextOutlined />}
          onClick={handleExportYaml}
          loading={isExportingYaml}
          disabled={
            (isRecording && liveEvents.length === 0) ||
            (!isRecording && events.length === 0)
          }
        >
          {isExportingYaml ? 'Generating YAML...' : 'Export as YAML'}
        </Button>

        <Button
          icon={<DownloadOutlined />}
          onClick={handleExportEvents}
          disabled={
            (isRecording && liveEvents.length === 0) ||
            (!isRecording && events.length === 0)
          }
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
    </>
  );
};
