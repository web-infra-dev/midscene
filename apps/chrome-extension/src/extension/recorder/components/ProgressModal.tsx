import {
  CheckCircleOutlined,
  CheckOutlined,
  CodeOutlined,
  CopyOutlined,
  DownOutlined,
  DownloadOutlined,
  FileTextOutlined,
  LoadingOutlined,
  PushpinFilled,
  PushpinOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import type { CodeGenerationChunk, StreamingCallback } from '@midscene/core';
import type { ChromeRecordedEvent } from '@midscene/recorder';
import { ShinyText } from '@midscene/visualizer';
import { Button, Progress, Select, Tooltip, Typography, message } from 'antd';
import type React from 'react';
import { useEffect, useState } from 'react';
import { useRecordStore, useRecordingSessionStore } from '../../../store';
import { generateAIDescription } from '../../../utils/eventOptimizer';
import {
  generatePlaywrightTestStream,
  generateYamlTest,
  generateYamlTestStream,
} from '../generators';
import { recordLogger } from '../logger';
import {
  getLatestEvents,
  resolveSessionName,
  stopRecordingIfActive,
} from '../shared/exportControlsUtils';
import { generateRecordTitle } from '../utils';
import { PlaywrightCodeBlock } from './ProgressModal/PlaywrightCodeBlock';
import { StepList } from './ProgressModal/StepList';
import { YamlCodeBlock } from './ProgressModal/YamlCodeBlock';

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
  isFromStopRecording?: boolean;
}

export const ProgressModal: React.FC<ProgressModalProps> = ({
  eventsCount = 0,
  sessionName = '',
  events = [],
  sessionId,
  onStopRecording,
  isFromStopRecording,
}) => {
  const [selectedType, setSelectedType] = useState<CodeGenerationType>('yaml');

  // Initialize defaultType from localStorage
  const [defaultType, setDefaultType] = useState<CodeGenerationType>(() => {
    try {
      const stored = localStorage.getItem('midscene-default-code-type');
      if (stored && ['yaml', 'playwright', 'none'].includes(stored)) {
        return stored as CodeGenerationType;
      }
    } catch (error) {
      console.warn(
        'Failed to read default code type from localStorage:',
        error,
      );
    }
    return 'yaml'; // fallback default
  });
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [slidingOutSteps, setSlidingOutSteps] = useState<Set<string>>(
    new Set(),
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedTest, setGeneratedTest] = useState('');
  const [generatedYaml, setGeneratedYaml] = useState('');
  const [steps, setSteps] = useState<ProgressStep[]>([]);
  const [showGeneratedCode, setShowGeneratedCode] = useState(false);

  // Streaming states
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [thinkingProcess, setThinkingProcess] = useState('');
  const [actualCode, setActualCode] = useState('');
  const [accumulatedThinking, setAccumulatedThinking] = useState('');

  const { updateSession } = useRecordingSessionStore();

  // Function to update defaultType and persist to localStorage
  const updateDefaultType = (newType: CodeGenerationType) => {
    setDefaultType(newType);
    try {
      localStorage.setItem('midscene-default-code-type', newType);
    } catch (error) {
      console.warn('Failed to save default code type to localStorage:', error);
    }
  };

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

  // Merge: load persisted code and handle auto-generation/display logic
  useEffect(() => {
    const session = getCurrentSession();

    // If this is from stop recording, use the pinned default type
    if (isFromStopRecording && eventsCount > 0) {
      setSelectedType(defaultType);
      // Only generate code if the pinned default is not 'none'
      if (defaultType === 'playwright' || defaultType === 'yaml') {
        handleGenerateCode(defaultType);
      }
      return;
    }

    // If the pinned default is 'none', set selected type to 'none' and don't generate anything
    if (defaultType === 'none') {
      setSelectedType('none');
      return;
    }

    // Prefer loading persisted code from session
    if (session?.generatedCode) {
      if (session.generatedCode.playwright && !generatedTest) {
        setGeneratedTest(session.generatedCode.playwright);
      }
      if (session.generatedCode.yaml && !generatedYaml) {
        setGeneratedYaml(session.generatedCode.yaml);
      }
    }

    // Check if the pinned default type has generated code
    const hasDefaultTypeCode =
      defaultType === 'yaml'
        ? generatedYaml || session?.generatedCode?.yaml
        : defaultType === 'playwright'
          ? generatedTest || session?.generatedCode?.playwright
          : false;

    // If the pinned default type has code, show it directly
    if (hasDefaultTypeCode) {
      setSelectedType(defaultType);
      setShowGeneratedCode(true);
      return;
    }

    // If the pinned default type doesn't have code and we have events, generate it
    if (
      eventsCount > 0 &&
      (defaultType === 'playwright' || defaultType === 'yaml')
    ) {
      setSelectedType(defaultType);
      handleGenerateCode(defaultType);
    } else {
      // Set selected type to the pinned default (even if it's a valid type but no events)
      setSelectedType(defaultType);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, isFromStopRecording]);

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
      (event: ChromeRecordedEvent) =>
        event.type !== 'navigation' && event.type !== 'scroll',
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

    recordLogger.info('eventsNeedingDescriptions', {
      eventsNeedingDescriptions,
      events,
    });

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
    }

    updateProgressStep(stepIndex, {
      status: 'completed',
      progress: 100,
      details: `Generated descriptions for ${events.length} elements`,
    });

    return finalEvents;
  };

  // Streaming callback handler
  const handleStreamingChunk: StreamingCallback = (
    chunk: CodeGenerationChunk,
  ) => {
    setStreamingContent(chunk.accumulated);
    const code = chunk.accumulated;
    const thinking = chunk.reasoning_content;

    // Accumulate thinking process content
    if (thinking) {
      setAccumulatedThinking((prev) => prev + thinking);
    }

    setThinkingProcess(thinking);
    setActualCode(code);

    if (chunk.isComplete) {
      setIsStreaming(false);

      // Use the actual code for final result
      const finalCode = code || chunk.accumulated;

      // Set the final generated code
      if (selectedType === 'playwright') {
        setGeneratedTest(finalCode);
      } else if (selectedType === 'yaml') {
        setGeneratedYaml(finalCode);
      }

      // Update session with final code
      if (sessionId) {
        updateSession(sessionId, {
          generatedCode: {
            ...getCurrentSession()?.generatedCode,
            [selectedType]: finalCode,
          },
          updatedAt: Date.now(),
        });
      }
    }
  };

  // Common function to handle code generation with streaming support
  const handleCodeGeneration = async (type: 'playwright' | 'yaml') => {
    // Get the most current events
    const currentEvents = getCurrentEvents();

    if (currentEvents.length === 0) {
      message.warning(`No events to generate ${type} from`);
      return;
    }

    setIsGenerating(true);
    setIsStreaming(true);
    setStreamingContent('');
    setThinkingProcess('');
    setActualCode('');
    setAccumulatedThinking('');

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

      // Step 3: Generate code with streaming support
      updateProgressStep(2, {
        status: 'loading',
        details:
          type === 'playwright'
            ? 'Generating Playwright test code...'
            : 'Generating YAML configuration...',
      });

      finalEvents = getCurrentEvents();

      // Show the code generation area immediately when streaming starts
      setShowGeneratedCode(true);

      let generatedCode: string;

      if (type === 'playwright') {
        // Use streaming for Playwright
        const streamingResult = await generatePlaywrightTestStream(
          finalEvents,
          {
            stream: true,
            onChunk: handleStreamingChunk,
          },
        );
        generatedCode = streamingResult.content;
      } else {
        // Use streaming for YAML
        const streamingResult = await generateYamlTestStream(finalEvents, {
          stream: true,
          onChunk: handleStreamingChunk,
          testName: currentSessionName,
          description: `Test session recorded on ${new Date().toLocaleDateString()}`,
          includeTimestamps: true,
        });
        generatedCode = streamingResult.content;
      }

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

      // Show success message
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
      setIsStreaming(false);
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

  // Monitor step completion state changes, add sliding animation
  useEffect(() => {
    steps.forEach((step) => {
      if (step.status === 'completed' && !completedSteps.has(step.id)) {
        // Mark as sliding out state
        setSlidingOutSteps((prev) => new Set([...prev, step.id]));

        // Mark as completed after 500ms (remove from DOM)
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

  // Reset state when starting new generation
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
    {
      label: (
        <>
          <CodeOutlined className="text-blue-500" /> Playwright
        </>
      ),
      value: 'playwright' as const,
    },
    {
      label: (
        <>
          <FileTextOutlined className="text-green-500" /> YAML
        </>
      ),
      value: 'yaml' as const,
    },
    { label: 'None', value: 'none' as const },
  ];

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
          <div className="mb-5 flex items-center gap-4">
            <Select
              value={selectedType}
              onChange={(value) => {
                // Prevent selecting "None" directly - only allow through pin icon
                if (value === 'none') {
                  return;
                }
                setSelectedType(value);
                handleSelectChange(value);
              }}
              className="w-60"
              size="middle"
              suffixIcon={<DownOutlined />}
              disabled={isGenerating}
            >
              {codeTypeOptions.map((option) => (
                <Select.Option
                  key={option.value}
                  value={option.value}
                  disabled={option.value === 'none'}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={option.value === 'none' ? 'text-gray-400' : ''}
                    >
                      {option.label}
                    </span>
                    <div className="flex items-center gap-1">
                      <Tooltip
                        title={
                          option.value === 'none'
                            ? 'Click to set None as default (no auto-generation)'
                            : 'Pin as default code generation type'
                        }
                      >
                        {defaultType === option.value ? (
                          <PushpinFilled
                            className="text-blue-500 cursor-pointer hover:text-blue-600 ml-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              updateDefaultType(option.value);
                              // If pinning "None", also set it as selected type
                              if (option.value === 'none') {
                                setSelectedType('none');
                                handleSelectChange('none');
                              }
                            }}
                          />
                        ) : (
                          <PushpinOutlined
                            className="text-gray-400 cursor-pointer hover:text-gray-600 ml-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              updateDefaultType(option.value);
                              // If pinning "None", also set it as selected type
                              if (option.value === 'none') {
                                setSelectedType('none');
                                handleSelectChange('none');
                              }
                            }}
                          />
                        )}
                      </Tooltip>
                    </div>
                  </div>
                </Select.Option>
              ))}
            </Select>
            {(selectedType === 'playwright' || selectedType === 'yaml') &&
              (showGeneratedCode || isStreaming) && (
                <div className="flex gap-2 ml-auto">
                  <Button
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={
                      selectedType === 'playwright'
                        ? handleCopyTest
                        : handleCopyYaml
                    }
                    disabled={
                      isStreaming ||
                      (selectedType === 'playwright'
                        ? !generatedTest
                        : !generatedYaml)
                    }
                    title="Copy to clipboard"
                  />
                  <Button
                    size="small"
                    icon={<DownloadOutlined />}
                    onClick={
                      selectedType === 'playwright'
                        ? handleDownloadTest
                        : handleDownloadYaml
                    }
                    disabled={
                      isStreaming ||
                      (selectedType === 'playwright'
                        ? !generatedTest
                        : !generatedYaml)
                    }
                    title={
                      selectedType === 'playwright'
                        ? 'Download as .ts file'
                        : 'Download as .yaml file'
                    }
                  />
                  <Button
                    size="small"
                    icon={<ReloadOutlined />}
                    onClick={
                      selectedType === 'playwright'
                        ? handleRegenerateTest
                        : handleRegenerateYaml
                    }
                    disabled={isGenerating || isStreaming}
                    title="Regenerate code"
                  />
                </div>
              )}
          </div>
          {selectedType === 'none' && (
            <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded text-yellow-800 text-sm">
              <div className="font-semibold mb-1">
                No Code Generation Selected
              </div>
              <div>
                Selecting <b>None</b> means no code will be generated
                automatically.
              </div>
              <div className="mt-1">
                To auto-generate <b>YAML</b> or <b>Playwright</b> code, set it
                as the default (click the pin icon on the right).
                <br />
                When you stop recording, the system will automatically generate
                code for the default type.
              </div>
            </div>
          )}
        </>
      )}

      {/* Steps for selectedType only */}
      {steps.length > 0 &&
        !steps.every((step) => step.status === 'completed') &&
        (() => {
          // Check if the third step (code generation step) has started
          const thirdStepStarted =
            steps.length >= 3 &&
            (steps[2].status === 'loading' ||
              steps[2].status === 'completed' ||
              steps[2].status === 'error');

          // Hide step display if the third step has started
          if (thirdStepStarted) {
            return null;
          }

          return (
            <StepList
              steps={steps}
              completedSteps={completedSteps}
              slidingOutSteps={slidingOutSteps}
              getStepIcon={getStepIcon}
              getStepColor={getStepColor}
            />
          );
        })()}

      {/* Code block for selectedType only */}
      {(showGeneratedCode || isStreaming) && (
        <>
          {selectedType === 'playwright' && (generatedTest || isStreaming) && (
            <PlaywrightCodeBlock
              code={generatedTest}
              loading={isGenerating}
              isStreaming={isStreaming && selectedType === 'playwright'}
              streamingContent={streamingContent}
              thinkingProcess={thinkingProcess}
              actualCode={actualCode}
              accumulatedThinking={accumulatedThinking}
            />
          )}
          {selectedType === 'yaml' && (generatedYaml || isStreaming) && (
            <YamlCodeBlock
              code={generatedYaml}
              loading={isGenerating}
              isStreaming={isStreaming && selectedType === 'yaml'}
              streamingContent={streamingContent}
              thinkingProcess={thinkingProcess}
              actualCode={actualCode}
              accumulatedThinking={accumulatedThinking}
            />
          )}
        </>
      )}
    </>
  );
};
