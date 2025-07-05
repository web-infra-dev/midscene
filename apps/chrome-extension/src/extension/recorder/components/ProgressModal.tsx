import {
  CheckCircleOutlined,
  CheckOutlined,
  CodeOutlined,
  CopyOutlined,
  DownOutlined,
  DownloadOutlined,
  FileTextOutlined,
  LoadingOutlined,
  ReloadOutlined,
  StarOutlined,
  StarFilled,
} from '@ant-design/icons';
import type { ChromeRecordedEvent } from '@midscene/recorder';
import { ShinyText } from '@midscene/visualizer';
import { Button, Progress, Select, Typography, message, Tooltip } from 'antd';
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
  const [selectedType, setSelectedType] = useState<CodeGenerationType>('yaml');
  const [defaultType, setDefaultType] = useState<CodeGenerationType>('yaml');
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
        if (selectedType === 'playwright') {
          setShowGeneratedCode(true);
        }
      }
      if (session.generatedCode.yaml) {
        setGeneratedYaml(session.generatedCode.yaml);
        if (selectedType === 'yaml') {
          setShowGeneratedCode(true);
        }
      }
    }
  }, [sessionId, selectedType]);

  // 打开 Generate code 时自动生成（仅有 events 时）
  useEffect(() => {
    if (eventsCount > 0 && steps.length === 0 && !isGenerating) {
      setSelectedType(defaultType);
      handleGenerateCode(defaultType);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventsCount, defaultType]);

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
          let description = '';
          if (event.elementDescription && event.descriptionLoading === false) {
            description = event.elementDescription;
          } else {
            description = await generateAIDescription(event, event.hashId);
          }

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

      await new Promise((resolve) => setTimeout(resolve, 500));

      // Step 2: Generate session title and description if not already generated
      updateProgressStep(1, { status: 'loading' });

      finalEvents = getCurrentEvents();
      const currentSessionName = await generateSessionTitleAndDescription(
        finalEvents,
        1,
      );

      await new Promise((resolve) => setTimeout(resolve, 500));

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

    // Show/hide code based on what's available for the selected type
    if (value === 'playwright' && generatedTest) {
      setShowGeneratedCode(true);
    } else if (value === 'yaml' && generatedYaml) {
      setShowGeneratedCode(true);
    } else if (value === 'none') {
      setShowGeneratedCode(false);
      setGeneratedTest('');
      setGeneratedYaml('');
    } else if ((value === 'playwright' || value === 'yaml') && !isGenerating) {
      // Generate new code if none exists for this type
      handleGenerateCode(value);
    } else {
      setShowGeneratedCode(false);
      setGeneratedTest('');
      setGeneratedYaml('');
    }
  };

  const codeTypeOptions = [
    { label: 'Playwright', value: 'playwright' as const },
    { label: 'YAML', value: 'yaml' as const },
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
        <div className="text-center text-gray-400 py-5">
          <div className="text-lg mb-2">No events to generate code from</div>
          <div className="text-sm">Record some interactions first</div>
        </div>
      ) : (
        <>
          <div className="mb-5">
            <Select
              value={selectedType}
              onChange={(value) => {
                setSelectedType(value);
                handleSelectChange(value);
              }}
              className="w-full"
              size="large"
              suffixIcon={<DownOutlined />}
            >
              {codeTypeOptions.map((option) => (
                <Select.Option key={option.value} value={option.value}>
                  <div className="flex items-center justify-between">
                    <span>{option.label}</span>
                    <div className="flex items-center gap-1">
                      {defaultType === option.value && <CheckOutlined className="text-green-500 ml-2" />}
                      <Tooltip title={option.value === 'none' ? '默认不生成代码' : '设为默认生成方式'}>
                        <button
                          type="button"
                          className="ml-1 p-0.5 rounded hover:bg-gray-100"
                          onClick={e => {
                            e.stopPropagation();
                            setDefaultType(option.value);
                          }}
                        >
                          {defaultType === option.value ? (
                            <StarFilled className="text-yellow-400" />
                          ) : (
                            <StarOutlined className="text-gray-400" />
                          )}
                        </button>
                      </Tooltip>
                    </div>
                  </div>
                </Select.Option>
              ))}
            </Select>
          </div>
        </>
      )}

      {steps.length > 0 && steps.some((step) => step.status !== 'completed') && (
        <div className="py-5">
          {steps
            .filter((step) => !completedSteps.has(step.id))
            .map((step, index, filteredSteps) => {
              const isSliding = slidingOutSteps.has(step.id);
              return (
                <div
                  key={step.id}
                  className={
                    `${isSliding ? 'translate-y-[-100%] opacity-0 h-0' : 'translate-y-0 opacity-100 h-auto'} mb-6 transition-transform duration-500 ease-out overflow-hidden`
                  }
                  style={{
                    transform: isSliding
                      ? 'translateY(-100%)'
                      : 'translateY(0)',
                    opacity: isSliding ? 0 : 1,
                    height: isSliding ? 0 : 'auto',
                  }}
                >
                  <div className="flex items-center mb-2">
                    <div className="mr-3 min-w-[20px]">
                      {getStepIcon(step)}
                    </div>
                    <div className="flex-1">
                      {step.status === 'loading' ? (
                        <div className="font-semibold text-[14px] leading-[22px] min-h-[22px] flex items-center">
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
                      <Text type="secondary" className="text-xs">
                        {step.description}
                      </Text>
                      {step.details && (
                        <>
                          <br />
                          <Text type="secondary" className="text-[11px] text-[#666]">
                            {step.details}
                          </Text>
                        </>
                      )}
                    </div>
                  </div>

                  {step.status === 'loading' && step.progress !== undefined && (
                    <div className="ml-8">
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
                      className={
                        `${step.status === 'completed' ? 'bg-green-500' : 'bg-gray-200'} ml-2 w-0.5 h-5 mt-2`
                      }
                    />
                  )}
                </div>
              );
            })}
        </div>
      )}

      {/* Generated Code Display */}
      {showGeneratedCode &&
        ((selectedType === 'playwright' && generatedTest) ||
          (selectedType === 'yaml' && generatedYaml)) && (
          <div className="mt-5">
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-2">
                {selectedType === 'playwright' ? (
                  <CodeOutlined />
                ) : (
                  <FileTextOutlined />
                )}
                <Text strong>
                  {selectedType === 'playwright'
                    ? 'Playwright Test'
                    : 'YAML Configuration'}
                </Text>
              </div>
              <div className="flex gap-2">
                <Button
                  icon={<ReloadOutlined />}
                  onClick={
                    selectedType === 'playwright'
                      ? handleRegenerateTest
                      : handleRegenerateYaml
                  }
                  disabled={isGenerating}
                  size="small"
                >
                  Regenerate
                </Button>
                <Button
                  icon={<CopyOutlined />}
                  onClick={
                    selectedType === 'playwright'
                      ? handleCopyTest
                      : handleCopyYaml
                  }
                  size="small"
                >
                  Copy
                </Button>
                <Button
                  type="primary"
                  icon={<DownloadOutlined />}
                  onClick={
                    selectedType === 'playwright'
                      ? handleDownloadTest
                      : handleDownloadYaml
                  }
                  size="small"
                >
                  Download
                </Button>
              </div>
            </div>

            <div className="max-h-[55vh] overflow-auto bg-[#1e1e1e] p-4 rounded-md border border-gray-300 font-mono">
              <pre className="m-0 whitespace-pre-wrap text-[#d4d4d4] text-[13px] leading-[1.5] tab-size-[2]">
                {selectedType === 'playwright'
                  ? generatedTest
                  : generatedYaml || 'Generated code will appear here...'}
              </pre>
            </div>

            <div className="mt-3">
              <Text type="secondary">
                {selectedType === 'playwright' ? (
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

            {((selectedType === 'playwright' && generatedTest) ||
              (selectedType === 'yaml' && generatedYaml)) && (
                <div className="mt-3 text-center">
                  <Text type="secondary" className="text-xs">
                    {selectedType === 'playwright' ? (
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
