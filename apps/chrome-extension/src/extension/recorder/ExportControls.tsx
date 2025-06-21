import {
  CodeOutlined,
  CopyOutlined,
  DownloadOutlined,
  FileTextOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import type { ChromeRecordedEvent } from '@midscene/recorder';
import { Button, Dropdown, Modal, Space, Typography, message } from 'antd';
import type { MenuProps } from 'antd';
import type React from 'react';
import { useEffect, useState } from 'react';
import { useRecordStore, useRecordingSessionStore } from '../../store';
import { generateAIDescription } from '../../utils/eventOptimizer';
import { ProgressModal, type ProgressStep } from './components/ProgressModal';
import { generatePlaywrightTest, generateYamlTest } from './generators';
import { recordLogger } from './logger';
import {
  getLatestEvents,
  resolveSessionName,
  stopRecordingIfActive,
} from './shared/exportControlsUtils';
import { generateRecordTitle } from './utils';

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

  // Get current session helper
  const getCurrentSession = () => {
    if (!sessionId) return null;
    return (
      useRecordingSessionStore
        .getState()
        .sessions.find((s) => s.id === sessionId) || null
    );
  };

  // Load existing generated code when component mounts or sessionId changes
  useEffect(() => {
    const session = getCurrentSession();
    if (session?.generatedCode) {
      if (session.generatedCode.playwright) {
        setGeneratedTest(session.generatedCode.playwright);
      }
      if (session.generatedCode.yaml) {
        setGeneratedYaml(session.generatedCode.yaml);
      }
    }
  }, [sessionId]);

  // Progress modal state
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [progressSteps, setProgressSteps] = useState<ProgressStep[]>([]);
  const [showConfetti, setShowConfetti] = useState(false);
  const [currentGenerationType, setCurrentGenerationType] = useState<
    'playwright' | 'yaml' | null
  >(null);

  // Create a function to get the latest events with AI descriptions
  const getCurrentEvents = (): ChromeRecordedEvent[] => {
    return getLatestEvents(sessionId);
  };

  // Generate session title and description using AI
  const generateSessionTitleAndDescription = async (
    finalEvents: ChromeRecordedEvent[],
    stepIndex: number,
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
        // Update progress: Step 1 in progress
        updateProgressStep(stepIndex, {
          status: 'loading',
          details: 'Analyzing session content...',
        });

        const { title, description } = await generateRecordTitle(finalEvents);

        if (title || description) {
          updateSession(sessionId, {
            name: title || session.name,
            description: description || session.description,
          });

          // Update the session name to use for export
          currentSessionName = title || session.name;
        }

        // Update progress: Step 1 completed
        updateProgressStep(stepIndex, {
          status: 'completed',
          details: `Generated: "${currentSessionName}"`,
        });
      } else if (session) {
        // Use the current session name from the store in case it was updated elsewhere
        currentSessionName = session.name;

        // Update progress: Step 1 completed (skipped)
        updateProgressStep(stepIndex, {
          status: 'completed',
          details: `Using existing: "${currentSessionName}"`,
        });
      }
    } else {
      // Update progress: Step 1 completed (no session)
      updateProgressStep(stepIndex, {
        status: 'completed',
        details: `Using provided: "${currentSessionName}"`,
      });
    }

    return currentSessionName;
  };

  // Helper function to update progress step
  const updateProgressStep = (
    stepIndex: number,
    updates: Partial<ProgressStep>,
  ) => {
    setProgressSteps((prevSteps) =>
      prevSteps.map((step, index) =>
        index === stepIndex ? { ...step, ...updates } : step,
      ),
    );
  };

  // Generate element descriptions for events that need them
  const generateElementDescriptions = async (
    events: ChromeRecordedEvent[],
    stepIndex: number,
  ): Promise<ChromeRecordedEvent[]> => {
    const eventsNeedingDescriptions = events.filter(
      (event: ChromeRecordedEvent) => event.type !== 'navigation',
    );

    if (eventsNeedingDescriptions.length === 0) {
      updateProgressStep(stepIndex, {
        status: 'completed',
        details: 'All elements already have descriptions',
      });
      return events;
    }

    updateProgressStep(stepIndex, {
      status: 'loading',
      progress: 0,
      details: `Generating descriptions for ${eventsNeedingDescriptions.length} elements...`,
    });

    let completedCount = 0;
    const finalEvents = [...events];

    // Process events in parallel with progress tracking
    const optimizePromises = eventsNeedingDescriptions.map(
      async (event, index) => {
        try {
          const description = await generateAIDescription(event, event.hashId);

          finalEvents[index] = {
            ...event,
            elementDescription: description,
            descriptionLoading: false,
          };
          completedCount++;

          const progress = Math.round((completedCount / eventsNeedingDescriptions.length) * 100);
          updateProgressStep(stepIndex, {
            status: 'loading',
            progress,
            details: `Generated ${completedCount}/${eventsNeedingDescriptions.length} element descriptions`,
          });
        } catch (error) {
          console.error('Failed to optimize event:', error);
          finalEvents[index] = {
            ...event,
            elementDescription: 'failed to generate element description',
            descriptionLoading: false,
          };
          completedCount++;
        }
      },
    );

    await Promise.all(optimizePromises);

    // Update session with new event descriptions if sessionId exists
    if (sessionId) {
      updateSession(sessionId, {
        events: finalEvents,
        updatedAt: Date.now(),
      });
      useRecordStore.getState().setEvents(finalEvents);
      recordLogger.info('Updated session with AI descriptions', {
        sessionId,
        finalEvents,
        eventsCount: finalEvents.length,
        descriptionsGenerated: eventsNeedingDescriptions.length,
      });
    }

    updateProgressStep(stepIndex, {
      status: 'completed',
      progress: 100,
      details: `Generated descriptions for ${events.length} elements`,
    });

    return finalEvents;
  };

  // Common function to handle code generation
  const handleCodeGeneration = async (type: 'playwright' | 'yaml') => {
    // Get the most current events
    const currentEvents = getCurrentEvents();

    if (currentEvents.length === 0) {
      message.warning(`No events to generate ${type} from`);
      return;
    }

    setIsGenerating(true);
    setCurrentGenerationType(type);

    // Initialize progress steps
    const steps: ProgressStep[] = [
      {
        id: 'descriptions',
        title: 'Generate Element Descriptions',
        description: 'Analyzing UI elements and generating descriptions',
        status: 'pending',
      },
      {
        id: 'title',
        title: 'Generate Title & Description',
        description: 'Creating session title and description using AI',
        status: 'pending',
      },
      {
        id: type,
        title:
          type === 'playwright'
            ? 'Generate Playwright Code'
            : 'Generate YAML Configuration',
        description:
          type === 'playwright'
            ? 'Creating executable Playwright test code'
            : 'Creating YAML configuration',
        status: 'pending',
      },
    ];

    setProgressSteps(steps);
    setShowProgressModal(true);

    try {
      // Step 0: Stop recording if currently recording
      await stopRecordingIfActive(onStopRecording);

      // After stopping recording, get the latest events from session
      let finalEvents = getCurrentEvents();
      recordLogger.info('start generating code', {
        finalEvents,
        sessionId,
      });

      // Step 1: Generate element descriptions
      updateProgressStep(0, { status: 'loading' });
      finalEvents = await generateElementDescriptions(finalEvents, 0);
      // generate again to ensure all descriptions are generated
      recordLogger.info('Generated element descriptions', {
        finalEvents,
        sessionId,
      });

      // Step 2: Generate session title and description if not already generated
      updateProgressStep(1, { status: 'loading' });

      finalEvents = getCurrentEvents();
      const currentSessionName = await generateSessionTitleAndDescription(
        finalEvents,
        1,
      );
      recordLogger.info('Generated session title and description', {
        finalEvents,
        sessionId,
        currentSessionName,
      });

      // Step 3: Generate code
      updateProgressStep(2, {
        status: 'loading',
        details:
          type === 'playwright'
            ? 'Generating Playwright test code...'
            : 'Generating YAML configuration...',
      });

      finalEvents = getCurrentEvents();
      const generatedCode =
        type === 'playwright'
          ? await generatePlaywrightTest(finalEvents)
          : await generateYamlTest(finalEvents, {
            testName: currentSessionName,
            description: `Test session recorded on ${new Date().toLocaleDateString()}`,
            includeTimestamps: true,
          });

      // Update session with generated code if sessionId exists
      if (sessionId) {
        updateSession(sessionId, {
          generatedCode: {
            ...getCurrentSession()?.generatedCode,
            [type]: generatedCode,
          },
          updatedAt: Date.now(),
        });
      }

      // Set the generated code in state
      if (type === 'playwright') {
        setGeneratedTest(generatedCode);
      } else {
        setGeneratedYaml(generatedCode);
      }

      // Mark all steps as completed
      steps.forEach((_, index) => {
        updateProgressStep(index, { status: 'completed' });
      });

      // Show success message and confetti
      setShowConfetti(true);
      setTimeout(() => {
        setShowProgressModal(false);
        setShowConfetti(false);
        if (type === 'playwright') {
          setShowTestModal(true);
        } else {
          setShowYamlModal(true);
        }
        message.success(
          `AI ${type === 'playwright' ? 'Playwright test' : 'YAML configuration'} generated successfully!`,
        );
      }, 3000);
    } catch (error) {
      recordLogger.error(`Failed to generate ${type}`, undefined, error);

      // Update current step to error status
      const currentStep = progressSteps.findIndex(
        (step) => step.status === 'loading',
      );
      if (currentStep >= 0) {
        updateProgressStep(currentStep, {
          status: 'error',
          details: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }

      setTimeout(() => {
        setShowProgressModal(false);
        message.error(
          `Failed to generate ${type}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }, 2000);
    } finally {
      setIsGenerating(false);
      setCurrentGenerationType(null);
    }
  };

  // Generate Playwright test from recorded events
  const handleGenerateTest = () => handleCodeGeneration('playwright');

  // Generate YAML test from recorded events
  const handleGenerateYaml = () => handleCodeGeneration('yaml');

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

  // Regenerate Playwright test
  const handleRegenerateTest = async () => {
    await handleGenerateTest();
  };

  // Regenerate YAML test
  const handleRegenerateYaml = async () => {
    await handleGenerateYaml();
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

      {/* Progress Modal for AI Generation */}
      <ProgressModal
        open={showProgressModal}
        title={`AI ${currentGenerationType === 'playwright' ? 'Playwright Test' : 'YAML Configuration'} Generation`}
        steps={progressSteps}
        showConfetti={showConfetti}
        onComplete={() => {
          setShowProgressModal(false);
          setShowConfetti(false);
          if (currentGenerationType === 'playwright') {
            setShowTestModal(true);
          } else if (currentGenerationType === 'yaml') {
            setShowYamlModal(true);
          }
        }}
      />

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
        footer={
          <div
            style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}
          >
            <Button
              icon={<ReloadOutlined />}
              onClick={handleRegenerateTest}
              disabled={isGenerating}
            >
              Regenerate
            </Button>
            <Button icon={<CopyOutlined />} onClick={handleCopyTest}>
              Copy
            </Button>
            <Button
              type="primary"
              icon={<DownloadOutlined />}
              onClick={handleDownloadTest}
            >
              Download
            </Button>
          </div>
        }
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
        footer={
          <div
            style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}
          >
            <Button
              icon={<ReloadOutlined />}
              onClick={handleRegenerateYaml}
              disabled={isGenerating}
            >
              Regenerate
            </Button>
            <Button icon={<CopyOutlined />} onClick={handleCopyYaml}>
              Copy
            </Button>
            <Button
              type="primary"
              icon={<DownloadOutlined />}
              onClick={handleDownloadYaml}
            >
              Download
            </Button>
          </div>
        }
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
