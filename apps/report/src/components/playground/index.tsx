import type { DeviceAction, UIContext } from '@midscene/core';
import { PlaygroundSDK, noReplayAPIs } from '@midscene/playground';
import type { ServerResponse } from '@midscene/playground';
import { PLAYGROUND_SERVER_PORT } from '@midscene/shared/constants';
import { overrideAIConfig } from '@midscene/shared/env';
import {
  ContextPreview,
  Logo,
  type PlaygroundResult,
  PlaygroundResultView,
  PromptInput,
  type ReplayScriptsInfo,
  ServiceModeControl,
  allScriptsFromDump,
  useEnvConfig,
  useServerValid,
} from '@midscene/visualizer';
import type { StaticPageAgent } from '@midscene/web/static';
import { Form, message } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';

type ServiceModeType = 'Server' | 'In-Browser' | 'In-Browser-Extension';

// Constants
const PROGRESS_POLL_INTERVAL = 500;
const DEFAULT_AGENT_ERROR = 'PlaygroundSDK not initialized';

const blankResult = {
  result: null,
  dump: null,
  reportHTML: null,
  error: null,
};

// Initialize PlaygroundSDK instances for different service modes
const getPlaygroundSDK = (serviceMode: ServiceModeType, agent?: any) => {
  if (serviceMode === 'Server') {
    return new PlaygroundSDK({
      type: 'remote-execution',
      serverUrl: `http://localhost:${PLAYGROUND_SERVER_PORT}`,
    });
  }
  // For In-Browser and In-Browser-Extension modes, use local execution
  if (!agent) {
    throw new Error('Agent is required for local execution mode');
  }
  return new PlaygroundSDK({
    type: 'local-execution',
    agent,
  });
};

// Utility function to determine if the run button should be enabled
function getRunButtonEnabled(
  serviceMode: ServiceModeType,
  getAgent: () => any | undefined,
  configAlreadySet: boolean,
  serverValid: boolean,
) {
  return (
    (serviceMode === 'In-Browser' && !!getAgent && configAlreadySet) ||
    (serviceMode === 'Server' && serverValid) ||
    (serviceMode === 'In-Browser-Extension' && !!getAgent && configAlreadySet)
  );
}
interface PlaygroundProps {
  getAgent: (forceSameTabNavigation?: boolean) => StaticPageAgent | null;
  hideLogo?: boolean;
  showContextPreview?: boolean;
  dryMode?: boolean;
}

// Standard Playground Component (In-Browser and Server modes)
export function StandardPlayground({
  getAgent,
  hideLogo = false,
  showContextPreview = true,
  dryMode = false,
}: PlaygroundProps) {
  const { serviceMode } = useEnvConfig();
  // State management
  const [uiContextPreview, setUiContextPreview] = useState<
    UIContext | undefined
  >(undefined);
  const [loading, setLoading] = useState(false);
  const [loadingProgressText, setLoadingProgressText] = useState('');
  const [result, setResult] = useState<PlaygroundResult | null>(null);
  const [replayScriptsInfo, setReplayScriptsInfo] =
    useState<ReplayScriptsInfo | null>(null);
  const [replayCounter, setReplayCounter] = useState(0);
  const [actionSpace, setActionSpace] = useState<DeviceAction<any>[]>([]);
  const [actionSpaceLoading, setActionSpaceLoading] = useState(true);

  // Form and environment configuration
  const [form] = Form.useForm();
  const { config, deepThink, screenshotIncluded, domIncluded } = useEnvConfig();

  const currentAgentRef = useRef<any>(null);
  const currentRunningIdRef = useRef<string | null>(null);
  const interruptedFlagRef = useRef<Record<string, boolean>>({});

  // Environment configuration check
  const configAlreadySet = Object.keys(config || {}).length >= 1;
  const serverValid = useServerValid(serviceMode === 'Server');

  // Get PlaygroundSDK instance based on service mode
  const playgroundSDK = useRef<PlaygroundSDK | null>(null);
  const currentAgent = useRef<any>(null);

  // Initialize PlaygroundSDK when service mode or agent changes
  useEffect(() => {
    if (serviceMode === 'Server') {
      // For server mode, we don't need agent initially
      playgroundSDK.current = getPlaygroundSDK(serviceMode as ServiceModeType);
    }
    // For In-Browser mode, we'll initialize PlaygroundSDK when we actually need it
    // to ensure we use the same agent instance
  }, [serviceMode]);

  // Optimized PlaygroundSDK getter that caches instances based on agent
  const getOrCreatePlaygroundSDK = useCallback(
    (agent: any) => {
      // Only recreate if agent has changed or SDK doesn't exist
      if (!playgroundSDK.current || currentAgent.current !== agent) {
        playgroundSDK.current = getPlaygroundSDK(
          serviceMode as ServiceModeType,
          agent,
        );
        currentAgent.current = agent;
      }
      return playgroundSDK.current;
    },
    [serviceMode],
  );

  // Override AI configuration
  useEffect(() => {
    overrideAIConfig(config);
  }, [config]);

  // Initialize context preview
  useEffect(() => {
    if (uiContextPreview) return;
    if (!showContextPreview) return;

    getAgent()
      ?.getUIContext()
      .then((context: UIContext) => {
        setUiContextPreview(context);
      })
      .catch((e) => {
        message.error('Failed to get UI context');
        console.error(e);
      });
  }, [uiContextPreview, showContextPreview, getAgent]);

  // Initialize actionSpace using PlaygroundSDK
  useEffect(() => {
    const loadActionSpace = async () => {
      setActionSpaceLoading(true);
      try {
        if (serviceMode === 'Server') {
          // For server mode, get from SDK with context
          const agent = getAgent();
          if (agent?.getUIContext && playgroundSDK.current) {
            const uiContext = await agent.getUIContext();
            // Pass the context object directly, not as string
            const space = await playgroundSDK.current.getActionSpace(uiContext);
            setActionSpace(space || []);
          } else {
            setActionSpace([]);
          }
        } else {
          // For in-browser mode, get from agent
          const agent = getAgent();
          if (agent?.getActionSpace) {
            const space = await agent.getActionSpace();
            setActionSpace(space || []);
          } else {
            setActionSpace([]);
          }
        }
      } catch (error) {
        console.error('Failed to load actionSpace:', error);
        setActionSpace([]);
      } finally {
        setActionSpaceLoading(false);
      }
    };

    if (serviceMode === 'Server' && playgroundSDK.current) {
      loadActionSpace();
    } else if (serviceMode === 'In-Browser') {
      // For In-Browser mode, we don't need PlaygroundSDK for actionSpace loading
      loadActionSpace();
    }
  }, [serviceMode, getAgent, serverValid, configAlreadySet]);

  // Handle form submission
  const handleRun = useCallback(async () => {
    const value = form.getFieldsValue();
    const { type, prompt, params } = value;

    // Dynamic validation using PlaygroundSDK
    const action = actionSpace?.find(
      (a: DeviceAction<any>) => a.interfaceAlias === type || a.name === type,
    );

    // Use PlaygroundSDK for validation if available
    if (playgroundSDK.current) {
      const validationResult = playgroundSDK.current.validateStructuredParams(
        { type, prompt, params },
        action,
      );

      if (!validationResult.valid) {
        message.error(validationResult.errorMessage || 'Validation failed');
        return;
      }
    } else {
      // Fallback validation logic
      const needsStructuredParams = !!action?.paramSchema;
      if (needsStructuredParams && !params) {
        message.error('Structured parameters are required for this action');
        return;
      } else if (!needsStructuredParams && !prompt) {
        message.error('Prompt is required');
        return;
      }
    }

    const startTime = Date.now();

    setLoading(true);
    setResult(null);
    const result: PlaygroundResult = { ...blankResult };

    const activeAgent = getAgent();
    const thisRunningId = Date.now().toString();

    const actionType = value.type;
    let progressInterval: NodeJS.Timeout | null = null;

    try {
      if (!activeAgent) {
        throw new Error('No agent found');
      }
      currentAgentRef.current = activeAgent;

      currentRunningIdRef.current = thisRunningId;
      interruptedFlagRef.current[thisRunningId] = false;
      activeAgent.resetDump();

      // Set up progress callback for direct agent execution
      activeAgent.onTaskStartTip = (tip: string) => {
        if (interruptedFlagRef.current[thisRunningId]) {
          return;
        }
        setLoadingProgressText(tip);
      };

      // Set up progress polling for PlaygroundSDK execution
      const pollProgress = () => {
        if (
          playgroundSDK.current &&
          !interruptedFlagRef.current[thisRunningId]
        ) {
          playgroundSDK.current
            .getTaskProgress(thisRunningId)
            .then((progressInfo) => {
              if (
                progressInfo.tip &&
                !interruptedFlagRef.current[thisRunningId]
              ) {
                setLoadingProgressText(progressInfo.tip);
              }
            })
            .catch(() => {
              // Ignore progress polling errors
            });
        }
      };

      // Start progress polling if using PlaygroundSDK
      if (playgroundSDK.current) {
        progressInterval = setInterval(pollProgress, PROGRESS_POLL_INTERVAL);
      }

      if (serviceMode === 'Server' && playgroundSDK.current) {
        // Use PlaygroundSDK for server mode
        const uiContext = await activeAgent?.getUIContext();
        const serverResponse = await playgroundSDK.current.executeAction(
          actionType,
          { type: actionType, prompt: value.prompt, params: value.params },
          {
            context: uiContext,
            deepThink,
            screenshotIncluded,
            domIncluded,
            requestId: thisRunningId,
          },
        );

        // Handle server response properly
        if (serverResponse && typeof serverResponse === 'object') {
          const response = serverResponse as ServerResponse;
          result.result = response.result;
          result.dump = response.dump;
          result.reportHTML = response.reportHTML;
          if (response.error) {
            result.error = response.error;
          }
          console.log('Server response:', {
            hasResult: !!response.result,
            hasDump: !!response.dump,
            hasReportHTML: !!response.reportHTML,
            hasError: !!response.error,
            actionType,
            requestId: thisRunningId,
          });
        } else {
          result.result = serverResponse;
        }
      } else {
        // Use PlaygroundSDK for In-Browser mode as well
        // Use optimized SDK getter to prevent unnecessary recreation
        const sdk = getOrCreatePlaygroundSDK(activeAgent);

        result.result = await sdk.executeAction(
          actionType,
          { type: actionType, prompt: value.prompt, params: value.params },
          {
            deepThink,
            screenshotIncluded,
            domIncluded,
            requestId: thisRunningId,
          },
        );
      }
    } catch (e: any) {
      const errorMessage = playgroundSDK.current
        ? playgroundSDK.current.formatErrorMessage(e)
        : DEFAULT_AGENT_ERROR;
      result.error = errorMessage;
      console.error('Playground execution error:', {
        error: e,
        actionType,
        requestId: thisRunningId,
        serviceMode,
      });

      // Clear progress polling interval on error
      if (progressInterval) {
        clearInterval(progressInterval);
      }
    }

    // Clear progress polling interval
    if (progressInterval) {
      clearInterval(progressInterval);
    }

    if (interruptedFlagRef.current[thisRunningId]) {
      console.log('interrupted, result is', result);
      return;
    }

    try {
      if (serviceMode === 'In-Browser') {
        // For In-Browser mode, get dump and reportHTML from agent after execution (even if there was an error)
        result.dump = activeAgent?.dumpDataString()
          ? JSON.parse(activeAgent.dumpDataString())
          : null;
        result.reportHTML = activeAgent?.reportHTMLString() || null;
      }
    } catch (e) {
      console.error('Error getting dump/reportHTML:', e);
    }

    try {
      console.log('destroy agent.page', activeAgent?.page);
      await activeAgent?.page?.destroy?.();
      console.log('destroy agent.page done', activeAgent?.page);
    } catch (e) {
      console.error(e);
    }

    currentAgentRef.current = null;

    setResult(result);
    setLoading(false);
    setLoadingProgressText(''); // Clear progress text when done

    // Only generate replay info for interaction APIs, not for data extraction or validation APIs

    if (result?.dump && !noReplayAPIs.includes(actionType)) {
      const info = allScriptsFromDump(result.dump);
      setReplayScriptsInfo(info);
      setReplayCounter((c) => c + 1);
    } else {
      setReplayScriptsInfo(null);
    }
    console.log('Playground execution completed:', {
      timeTaken: `${Date.now() - startTime}ms`,
      actionType,
      requestId: thisRunningId,
      hasResult: !!result.result,
      hasDump: !!result.dump,
      hasError: !!result.error,
    });
  }, [form, getAgent, serviceMode, deepThink, actionSpace, actionSpaceLoading]);

  // Dummy handleStop for Standard mode (no real stopping functionality)
  const handleStop = async () => {
    // Empty implementation as standard modes don't have stop functionality
  };

  // Validate if it can run
  const runButtonEnabled =
    getRunButtonEnabled(serviceMode, getAgent, configAlreadySet, serverValid) &&
    !actionSpaceLoading;

  // Always false for standard modes
  const stoppable = false;

  // Get the currently selected type
  const selectedType = Form.useWatch('type', form);

  // Form section
  const formSection = (
    <Form form={form} onFinish={handleRun}>
      <div className="playground-form-container">
        <div className="form-part">
          <ServiceModeControl
            serviceMode={serviceMode as 'Server' | 'In-Browser'}
          />
        </div>

        <ContextPreview
          uiContextPreview={uiContextPreview}
          setUiContextPreview={setUiContextPreview}
          showContextPreview={showContextPreview}
        />

        <PromptInput
          runButtonEnabled={runButtonEnabled}
          form={form}
          serviceMode={serviceMode}
          selectedType={selectedType}
          dryMode={dryMode}
          stoppable={stoppable}
          loading={loading}
          onRun={handleRun}
          onStop={handleStop}
          clearPromptAfterRun={false}
          actionSpace={actionSpace}
        />
      </div>
    </Form>
  );

  // Horizontal mode rendering
  return (
    <div className="playground-container">
      <PanelGroup autoSaveId="playground-layout" direction="horizontal">
        <Panel
          defaultSize={32}
          maxSize={60}
          minSize={20}
          style={{ paddingRight: '24px' }}
        >
          <Logo hideLogo={hideLogo} />
          {formSection}
        </Panel>
        <PanelResizeHandle className="panel-resize-handle" />
        <Panel>
          <div
            className="playground-result-view-container"
            style={
              result
                ? {}
                : {
                    border: '1px solid #0000001f',
                    borderRadius: '8px',
                    height: '90vh',
                    padding: '16px',
                  }
            }
          >
            <PlaygroundResultView
              result={result}
              loading={loading}
              serverValid={serverValid}
              serviceMode={serviceMode}
              replayScriptsInfo={replayScriptsInfo}
              replayCounter={replayCounter}
              loadingProgressText={loadingProgressText}
            />
          </div>
        </Panel>
      </PanelGroup>
    </div>
  );
}
