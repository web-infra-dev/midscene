import {
  CheckCircleOutlined,
  CodeOutlined,
  CopyOutlined,
  DownOutlined,
  DownloadOutlined,
  FileTextOutlined,
  LoadingOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import type { ChromeRecordedEvent } from '@midscene/recorder';
import { ShinyText } from '@midscene/visualizer';
import { Button, Progress, Select, Typography, message } from 'antd';
// @ts-ignore
import confetti from 'canvas-confetti';
import type React from 'react';
import { useEffect, useState } from 'react';
import { useRecordStore, useRecordingSessionStore } from '../../../store';
import { generateAIDescription } from '../../../utils/eventOptimizer';
import { generatePlaywrightTest, generateYamlTest } from '../generators';
import { recordLogger } from '../logger';
import {
  getLatestEvents,
  resolveSessionName,
  stopRecordingIfActive,
} from '../shared/exportControlsUtils';
import { generateRecordTitle } from '../utils';

const { Text } = Typography;

export interface ProgressStep {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'loading' | 'completed' | 'error';
  progress?: number;
  details?: string;
}

export type CodeGenerationType = 'yaml' | 'playwright' | 'none';

interface ProgressModalProps {
  eventsCount?: number;
  sessionName?: string;
  events?: ChromeRecordedEvent[];
  sessionId?: string;
  onStopRecording?: () => void | Promise<void>;
}

const triggerConfetti = () => {
  // Create a celebratory confetti effect
  const count = 200;
  const defaults = {
    origin: { y: 0.7 },
  };

  function fire(particleRatio: number, opts: any) {
    confetti({
      ...defaults,
      ...opts,
      particleCount: Math.floor(count * particleRatio),
    });
  }

  fire(0.25, {
    spread: 26,
    startVelocity: 55,
  });

  fire(0.2, {
    spread: 60,
  });

  fire(0.35, {
    spread: 100,
    decay: 0.91,
    scalar: 0.8,
  });

  fire(0.1, {
    spread: 120,
    startVelocity: 25,
    decay: 0.92,
    scalar: 1.2,
  });

  fire(0.1, {
    spread: 120,
    startVelocity: 45,
  });
};

export const ProgressModal: React.FC<ProgressModalProps> = ({
  eventsCount = 0,
  sessionName = '',
  events = [],
  sessionId,
  onStopRecording,
}) => {
  const [confettiVisible, setConfettiVisible] = useState(false);
  const [selectedType, setSelectedType] =
    useState<CodeGenerationType>('playwright');
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [slidingOutSteps, setSlidingOutSteps] = useState<Set<string>>(
    new Set(),
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedTest, setGeneratedTest] = useState('');
  const [generatedYaml, setGeneratedYaml] = useState('');
  const [steps, setSteps] = useState<ProgressStep[]>([]);
  const [showGeneratedCode, setShowGeneratedCode] = useState(false);
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

  // Get the latest events with AI descriptions
  const getCurrentEvents = (): ChromeRecordedEvent[] => {
    if (sessionId) {
      return getLatestEvents(sessionId);
    }
    return events;
  };

  // Load existing generated code when component mounts or sessionId changes
  useEffect(() => {
    const session = getCurrentSession();
    if (session?.generatedCode) {
      if (session.generatedCode.playwright) {
        setGeneratedTest(session.generatedCode.playwright);
        setShowGeneratedCode(true);
      }
      if (session.generatedCode.yaml) {
        setGeneratedYaml(session.generatedCode.yaml);
        setShowGeneratedCode(true);
      }
    }
  }, [sessionId]);

  // Helper function to update progress step
  const updateProgressStep = (
    stepIndex: number,
    updates: Partial<ProgressStep>,
  ) => {
    setSteps((prevSteps) =>
      prevSteps.map((step, index) =>
        index === stepIndex ? { ...step, ...updates } : step,
      ),
    );
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

          const progress = Math.round(
            (completedCount / eventsNeedingDescriptions.length) * 100,
          );
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

    // Initialize progress steps
    const progressSteps: ProgressStep[] = [
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

    setSteps(progressSteps);
    // Reset completed states
    setCompletedSteps(new Set());
    setSlidingOutSteps(new Set());
    // Hide code generation area when starting new generation
    setShowGeneratedCode(false);
    // Clear old generated code
    if (type === 'playwright') {
      setGeneratedTest('');
    } else {
      setGeneratedYaml('');
    }

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
      progressSteps.forEach((_, index) => {
        updateProgressStep(index, { status: 'completed' });
      });

      // Show the generated code after generation is complete
      setShowGeneratedCode(true);

      // Show success message and confetti
      setConfettiVisible(true);
      setTimeout(() => {
        setConfettiVisible(false);
      }, 1000);

      message.success(
        `AI ${type === 'playwright' ? 'Playwright test' : 'YAML configuration'} generated successfully!`,
      );
    } catch (error) {
      recordLogger.error(`Failed to generate ${type}`, undefined, error);

      // Update current step to error status
      const currentStep = steps.findIndex((step) => step.status === 'loading');
      if (currentStep >= 0) {
        updateProgressStep(currentStep, {
          status: 'error',
          details: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }

      setTimeout(() => {
        message.error(
          `Failed to generate ${type}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }, 2000);
    } finally {
      setIsGenerating(false);
    }
  };

  // Function to handle code generation from dropdown
  const handleGenerateCode = async (type: CodeGenerationType) => {
    if (getCurrentEvents().length === 0 || type === 'none') {
      return;
    }

    await handleCodeGeneration(type);
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

  // Regenerate Playwright test
  const handleRegenerateTest = async () => {
    await handleCodeGeneration('playwright');
  };

  // Regenerate YAML test
  const handleRegenerateYaml = async () => {
    await handleCodeGeneration('yaml');
  };
  // 监听步骤完成状态变化，添加滑动动画
  useEffect(() => {
    steps.forEach((step) => {
      if (step.status === 'completed' && !completedSteps.has(step.id)) {
        // 标记为滑出状态
        setSlidingOutSteps((prev) => new Set([...prev, step.id]));

        // 500ms后将其标记为已完成（从DOM中移除）
        setTimeout(() => {
          setCompletedSteps((prev) => new Set([...prev, step.id]));
          setSlidingOutSteps((prev) => {
            const newSet = new Set(prev);
            newSet.delete(step.id);
            return newSet;
          });
        }, 500);
      }
    });
  }, [steps, completedSteps]);

  // 重置状态当开始新的生成时
  const handleSelectChange = (value: CodeGenerationType) => {
    setSelectedType(value);
    if (value !== 'none' && !isGenerating) {
      handleGenerateCode(value);
    }
  };

  const codeTypeOptions = [
    { label: 'Playwright Test', value: 'playwright' as const },
    { label: 'YAML Configuration', value: 'yaml' as const },
    { label: 'None', value: 'none' as const },
  ];

  useEffect(() => {
    // 只有在所有步骤都完成且showConfetti为true时才显示撒花特效
    const allStepsCompleted = steps.every(
      (step) => step.status === 'completed',
    );

    if (allStepsCompleted && steps.length > 0 && !confettiVisible) {
      setConfettiVisible(true);

      // Trigger canvas-confetti effect
      triggerConfetti();

      const timer = setTimeout(() => {
        setConfettiVisible(false);
      }, 1000); // 撒花时间1秒
      return () => clearTimeout(timer);
    }
  }, [confettiVisible, steps]);

  const getStepIcon = (step: ProgressStep) => {
    switch (step.status) {
      case 'loading':
        return <LoadingOutlined style={{ color: '#1890ff' }} />;
      case 'completed':
        return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
      case 'error':
        return <CheckCircleOutlined style={{ color: '#ff4d4f' }} />;
      default:
        return (
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: '50%',
              backgroundColor: '#d9d9d9',
            }}
          />
        );
    }
  };

  const getStepColor = (step: ProgressStep) => {
    switch (step.status) {
      case 'loading':
        return '#1890ff';
      case 'completed':
        return '#52c41a';
      case 'error':
        return '#ff4d4f';
      default:
        return '#d9d9d9';
    }
  };

  return (
    <>
      {eventsCount === 0 ? (
        <div
          className="text-center text-gray-400"
          style={{ padding: '20px 0' }}
        >
          <div className="text-lg mb-2">No events to generate code from</div>
          <div className="text-sm">Record some interactions first</div>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: '20px' }}>
            <Select
              value={selectedType}
              onChange={handleSelectChange}
              style={{ width: '100%' }}
              size="large"
              suffixIcon={<DownOutlined />}
            >
              {codeTypeOptions.map((option) => (
                <Select.Option key={option.value} value={option.value}>
                  {option.label}
                </Select.Option>
              ))}
            </Select>
          </div>
        </>
      )}

      {steps.length > 0 && (
        <div style={{ padding: '20px 0' }}>
          {steps
            .filter((step) => !completedSteps.has(step.id)) // 只显示未完全消失的步骤
            .map((step, index, filteredSteps) => {
              const isSliding = slidingOutSteps.has(step.id);
              return (
                <div
                  key={step.id}
                  style={{
                    marginBottom: 24,
                    transform: isSliding
                      ? 'translateY(-100%)'
                      : 'translateY(0)',
                    opacity: isSliding ? 0 : 1,
                    transition:
                      'transform 0.5s ease-out, opacity 0.5s ease-out',
                    height: isSliding ? 0 : 'auto',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      marginBottom: 8,
                    }}
                  >
                    <div style={{ marginRight: 12, minWidth: 20 }}>
                      {getStepIcon(step)}
                    </div>
                    <div style={{ flex: 1 }}>
                      {step.status === 'loading' ? (
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: '14px',
                            lineHeight: '22px',
                            minHeight: '22px',
                            display: 'flex',
                            alignItems: 'center',
                          }}
                        >
                          <ShinyText
                            text={step.title}
                            disabled={false}
                            speed={3}
                            className="step-title-shiny"
                          />
                        </div>
                      ) : (
                        <div>
                          <Text
                            strong
                            style={{
                              color:
                                step.status === 'completed'
                                  ? '#52c41a'
                                  : undefined,
                              lineHeight: '22px',
                              minHeight: '22px',
                              display: 'inline-flex',
                              alignItems: 'center',
                            }}
                          >
                            {step.title}
                          </Text>
                        </div>
                      )}
                      <Text type="secondary" style={{ fontSize: '12px' }}>
                        {step.description}
                      </Text>
                      {step.details && (
                        <>
                          <br />
                          <Text
                            type="secondary"
                            style={{ fontSize: '11px', color: '#666' }}
                          >
                            {step.details}
                          </Text>
                        </>
                      )}
                    </div>
                  </div>

                  {step.status === 'loading' && step.progress !== undefined && (
                    <div style={{ marginLeft: 32 }}>
                      <Progress
                        percent={step.progress}
                        size="small"
                        strokeColor={getStepColor(step)}
                        showInfo={false}
                      />
                    </div>
                  )}

                  {index < filteredSteps.length - 1 && (
                    <div
                      style={{
                        marginLeft: 10,
                        width: 2,
                        height: 20,
                        backgroundColor:
                          step.status === 'completed' ? '#52c41a' : '#e8e8e8',
                        marginTop: 8,
                      }}
                    />
                  )}
                </div>
              );
            })}
        </div>
      )}

      {/* Generated Code Display */}
      {showGeneratedCode && (generatedTest || generatedYaml) && (
        <div style={{ marginTop: '20px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {generatedTest ? <CodeOutlined /> : <FileTextOutlined />}
              <Text strong>
                {generatedTest
                  ? 'Playwright Test'
                  : 'YAML Configuration'}
              </Text>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button
                icon={<ReloadOutlined />}
                onClick={
                  generatedTest ? handleRegenerateTest : handleRegenerateYaml
                }
                disabled={isGenerating}
                size="small"
              >
                Regenerate
              </Button>
              <Button
                icon={<CopyOutlined />}
                onClick={generatedTest ? handleCopyTest : handleCopyYaml}
                size="small"
              >
                Copy
              </Button>
              <Button
                type="primary"
                icon={<DownloadOutlined />}
                onClick={
                  generatedTest ? handleDownloadTest : handleDownloadYaml
                }
                size="small"
              >
                Download
              </Button>
            </div>
          </div>


          <div
            style={{
              height: '400px',
              maxHeight: '50vh',
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
              {generatedTest ||
                generatedYaml ||
                'Generated code will appear here...'}
            </pre>
          </div>

          <div style={{ marginTop: '12px' }}>
            <Text type="secondary">
              {generatedTest ? (
                <>
                  This test uses <strong>@midscene/web/playwright</strong> for
                  AI-powered web automation.
                </>
              ) : (
                <>
                  This YAML configuration can be used with various automation
                  frameworks that support <strong>@midscene/web</strong>{' '}
                  integration.
                </>
              )}
            </Text>
          </div>

          {(generatedTest || generatedYaml) && (
            <div style={{ marginTop: '12px', textAlign: 'center' }}>
              <Text type="secondary" style={{ fontSize: '12px' }}>
                {generatedTest ? (
                  <>
                    💡 Tip: This test is ready to run with{' '}
                    <code>npx playwright test</code>
                  </>
                ) : (
                  <>
                    💡 Tip: This YAML can be used with automation frameworks
                    that support @midscene/web
                  </>
                )}
              </Text>
            </div>
          )}
        </div>
      )}
    </>
  );
};
